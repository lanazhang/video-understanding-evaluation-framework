import json
import boto3
import os
import uuid
import time
from decimal import Decimal

S3_PRESIGNED_URL_EXPIRY_S = os.environ.get("S3_PRESIGNED_URL_EXPIRY_S", 3600)  # Default 1 hour
S3_BUCKET_DATA = os.environ.get("S3_BUCKET_DATA")
DYNAMO_VIDEO_ANALYZE_TABLE = os.environ.get("DYNAMO_VIDEO_ANALYZE_TABLE")
DYNAMO_VIDEO_TABLE = os.environ.get("DYNAMO_VIDEO_TABLE")
MODEL_ID_TLAB_27 = os.environ.get("MODEL_ID_TLAB_27")
MODEL_ID_TLAB_30 = os.environ.get("MODEL_ID_TLAB_30")
TLABS_S3_VECTOR_BUCKET = os.environ.get("TLABS_S3_VECTOR_BUCKET")

s3 = boto3.client('s3')
bedrock = boto3.client('bedrock-runtime')
s3vectors = boto3.client('s3vectors')
dynamodb = boto3.resource('dynamodb')


# Custom JSON encoder to handle Decimal types from DynamoDB
class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)


def lambda_handler(event, context):
    try:
        print(f"Received event: {json.dumps(event)}")
        
        # Parse body if it's a string (API Gateway format)
        if isinstance(event.get('body'), str):
            body = json.loads(event['body'])
        else:
            body = event
        
        video_id = body.get("VideoId")
        task_id = body.get("TaskId")
        search_text = body.get("SearchText", "")
        page_size = body.get("PageSize", 10)
        from_index = body.get("FromIndex", 0)
        input_bytes = body.get("InputBytes", "")
        input_type = body.get("InputType", "text")
        top_k = body.get("TopK", 5)
        include_video_url = body.get("IncludeVideoUrl", True)
        embedding_options = body.get("EmbeddingOptions")
        
        # Validate required parameters
        if not task_id:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'TaskId is required'})
            }
        
        if search_text is None:
            search_text = ""
        if input_bytes is None:
            input_bytes = ""
        
        if len(search_text) > 0:
            search_text = search_text.strip()
        
        if not search_text and not input_bytes:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'SearchText or InputBytes is required'})
            }
        
        # Get task information from DynamoDB
        analyze_table = dynamodb.Table(DYNAMO_VIDEO_ANALYZE_TABLE)
        task_response = analyze_table.get_item(Key={'Id': task_id, 'Type': 'tlabs-mme'})
        
        if 'Item' not in task_response:
            return {
                'statusCode': 404,
                'body': json.dumps({'error': f'Task not found: {task_id}'})
            }
        
        task = task_response['Item']
        model_id = task.get('ModelId', '')
        
        # Determine task type and model
        if "3-0" in model_id or "3.0" in model_id:
            task_type = "marengo30"
            model_id_for_embed = MODEL_ID_TLAB_30
            if not embedding_options:
                embedding_options = ["visual", "audio", "transcription"]
        else:
            task_type = "marengo27"
            model_id_for_embed = MODEL_ID_TLAB_27
            if not embedding_options:
                embedding_options = ["visual-text", "visual-image", "audio"]
        
        # Extract S3 vector info from task
        s3_vector_bucket = task.get("Result", {}).get("S3VectorBucket", TLABS_S3_VECTOR_BUCKET)
        s3_vector_index = task.get("Result", {}).get("S3VectorIndex")
        
        if not s3_vector_bucket or not s3_vector_index:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'S3 vector bucket or index not found in task result'})
            }
        
        print(f"Using vector index: {s3_vector_index} in bucket: {s3_vector_bucket}")
        
        # Generate embedding for search input
        input_embedding = get_embedding(input_type, search_text, input_bytes, model_id_for_embed, task_type)
        
        if not input_embedding:
            return {
                'statusCode': 500,
                'body': json.dumps({'error': 'Failed to generate input embedding'})
            }
        
        # Search embeddings
        clips = search_embedding_s3vectors(input_embedding, s3_vector_bucket, s3_vector_index, top_k, embedding_options)
        
        result = []
        if clips:
            for clip in clips:
                metadata = clip.get("metadata", {})
                clip_task_id = metadata.get("task_id")
                clip_video_id = metadata.get("video_id")
                
                # Get video information
                video_table = dynamodb.Table(DYNAMO_VIDEO_TABLE)
                video_response = video_table.get_item(Key={'Id': clip_video_id})
                video_item = video_response.get('Item', {})
                
                s3_bucket = video_item.get('S3Bucket')
                s3_key = video_item.get('S3KeyVideo')
                
                item = {
                    "TaskId": clip_task_id,
                    "VideoId": clip_video_id,
                    "StartSec": metadata.get("startSec"),
                    "EndSec": metadata.get("endSec"),
                    "EmbeddingOption": metadata.get("embeddingOption"),
                    "EmbeddingScope": metadata.get("embeddingScope"),  # For Marengo 3.0
                    "Distance": clip.get("distance"),
                    "S3Bucket": s3_bucket,
                    "S3Key": s3_key,
                    "VideoName": video_item.get('Name')
                }
                result.append(item)
        
        # Pagination
        from_index = from_index if from_index > 0 else 0
        end_index = from_index + page_size if from_index + page_size < len(result) else len(result)
        result = result[from_index: end_index]
        
        # Get S3 presigned URL
        if include_video_url:
            for item in result:
                s3_bucket = item.get("S3Bucket")
                s3_key = item.get("S3Key")
                if s3_bucket and s3_key:
                    try:
                        item["VideoUrl"] = s3.generate_presigned_url(
                            'get_object',
                            Params={'Bucket': s3_bucket, 'Key': s3_key},
                            ExpiresIn=S3_PRESIGNED_URL_EXPIRY_S
                        )
                    except Exception as e:
                        print(f"Error generating presigned URL: {e}")
        
        return {
            'statusCode': 200,
            'body': json.dumps(result, cls=DecimalEncoder)
        }
    
    except Exception as e:
        print(f"Error in lambda_handler: {str(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }


def get_embedding(input_type, search_text, input_bytes, model_id, task_type):
    """
    Generate embedding using TwelveLabs model
    
    Args:
        input_type: "text" or "image"
        search_text: Text to embed (for text input)
        input_bytes: Base64 encoded image bytes (for image input)
        model_id: TwelveLabs model ID
        task_type: "marengo27" or "marengo30"
    
    Returns:
        Embedding vector as list of floats
    """
    try:
        model_input = None
        
        if input_type == "text":
            if task_type == "marengo27":
                model_input = {
                    "inputType": "text",
                    "inputText": search_text
                }
            else:  # marengo30
                model_input = {
                    "inputType": "text",
                    "text": {
                        "inputText": search_text
                    }
                }
        elif input_type == "image":
            if task_type == "marengo27":
                model_input = {
                    "inputType": "image",
                    "mediaSource": {
                        "base64String": input_bytes
                    }
                }
            else:  # marengo30
                model_input = {
                    "inputType": "image",
                    "image": {
                        "mediaSource": {
                            "base64String": input_bytes
                        }
                    }
                }
        
        if not model_input:
            print(f"Invalid input type: {input_type}")
            return None
        
        print(f"Invoking model: {model_id} with input type: {input_type}")
        response = bedrock.invoke_model(
            modelId=f'us.{model_id}',
            body=json.dumps(model_input)
        )
        
        response_body = json.loads(response['body'].read().decode('utf-8'))
        embedding = response_body.get("data", [{}])[0].get("embedding")
        
        return embedding
    
    except Exception as e:
        print(f"Error generating embedding: {e}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return None


def search_embedding_s3vectors(input_embedding, s3vector_bucket, s3vector_index, top_k, embedding_options):
    """
    Search for similar embeddings in S3 Vector index
    
    Args:
        input_embedding: Query embedding vector
        s3vector_bucket: S3 Vector bucket name
        s3vector_index: S3 Vector index name
        top_k: Number of results to return
        embedding_options: List of embedding options to filter by
    
    Returns:
        List of matching vectors with metadata
    """
    try:
        print(f"Querying vector index: {s3vector_index} with top_k={top_k}")
        
        response = s3vectors.query_vectors(
            vectorBucketName=s3vector_bucket,
            indexName=s3vector_index,
            queryVector={"float32": input_embedding},
            topK=top_k,
            returnDistance=True,
            returnMetadata=True,
            filter={"embeddingOption": {"$in": embedding_options}}
        )
        
        print(f"Found {len(response.get('vectors', []))} matching vectors")
        return response.get("vectors", [])
    
    except Exception as e:
        print(f"Error querying vector index: {e}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return []
