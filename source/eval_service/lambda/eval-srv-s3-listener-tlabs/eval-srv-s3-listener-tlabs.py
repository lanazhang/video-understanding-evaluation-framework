"""
TwelveLabs S3 Listener Lambda
1. Read TwelveLabs embedding output from S3
2. Add embeddings to S3 Vector index
3. Update DynamoDB task status
"""
import json
import boto3
import os
import utils
import hashlib
from datetime import datetime, timezone

DYNAMO_VIDEO_ANALYZE_TABLE = os.environ.get("DYNAMO_VIDEO_ANALYZE_TABLE")
TLABS_S3_VECTOR_BUCKET = os.environ.get("TLABS_S3_VECTOR_BUCKET")
TLABS_S3_VECTOR_INDEX = os.environ.get("TLABS_S3_VECTOR_INDEX")
TLABS_S3_VECTOR_INDEX_30 = os.environ.get("TLABS_S3_VECTOR_INDEX_30")

s3 = boto3.client('s3')
s3vectors = boto3.client('s3vectors')

def lambda_handler(event, context):
    """
    Process TwelveLabs embedding output from S3 and store in vector index
    """
    try:
        print(f"Received event: {json.dumps(event)}")
        
        if event is None or "detail" not in event:
            return {
                'statusCode': 400,
                'body': 'Invalid trigger'
            }
        
        # Parse S3 event
        try:
            s3_bucket = event["detail"]["bucket"]["name"]
            s3_key = event["detail"]["object"]["key"]
            
            # Extract task_id from S3 key path: tasks/{video_id}/video-analyze/tlabs/{task_id}/...
            path_parts = s3_key.split('/')
            if len(path_parts) < 5:
                return {
                    'statusCode': 400,
                    'body': f'Invalid S3 key format: {s3_key}'
                }
            
            task_id = path_parts[4]  # tasks/video_id/video-analyze/tlabs/task_id/...
            
        except Exception as ex:
            print(f"Error parsing S3 trigger: {ex}")
            return {
                'statusCode': 400,
                'body': f'Error parsing S3 trigger: {ex}'
            }
        
        # Ignore search triggers - they are managed differently
        if '/tlabs/search/' in s3_key:
            print("Search trigger detected. Ignoring.")
            return {
                'statusCode': 200,
                'body': 'Search trigger. Ignored.'
            }
        
        # Only process output.json files
        if not s3_key.endswith('output.json'):
            print(f"Ignoring non-output file: {s3_key}")
            return {
                'statusCode': 200,
                'body': 'Not an output file. Ignored.'
            }
        
        if not s3_bucket or not s3_key or not task_id:
            return {
                'statusCode': 400,
                'body': 'Invalid trigger - missing required fields'
            }
        
        print(f"Processing TwelveLabs output: bucket={s3_bucket}, key={s3_key}, task_id={task_id}")
        
        # Extract video_id from path: tasks/{video_id}/video-analyze/tlabs/{task_id}/...
        path_parts = s3_key.split('/')
        if len(path_parts) >= 2:
            video_id = path_parts[1]
        else:
            print(f"Cannot extract video_id from S3 key: {s3_key}")
            return {
                'statusCode': 400,
                'body': 'Invalid S3 key format - cannot extract video_id'
            }
        
        print(f"Querying analyze table for VideoId: {video_id}, TaskId: {task_id}")
        
        # Query by VideoId to get tasks (needed because table has composite key: Id + Type)
        tasks = utils.dynamodb_query_by_index(
            DYNAMO_VIDEO_ANALYZE_TABLE,
            'VideoId-index',
            'VideoId',
            video_id
        )
        
        # Find the specific task by Id
        task_doc = None
        for t in tasks:
            if t.get('Id') == task_id:
                task_doc = t
                break
        
        if not task_doc:
            print(f"Task not found in DynamoDB: {task_id}")
            return {
                'statusCode': 404,
                'body': f'Task not found: {task_id}'
            }
        
        model_id = task_doc.get('ModelId', '')
        
        # Get embedding result from S3
        print(f"Reading embedding output from S3: s3://{s3_bucket}/{s3_key}")
        obj = s3.get_object(Bucket=s3_bucket, Key=s3_key)
        content = obj['Body'].read().decode('utf-8')
        output_data = json.loads(content).get("data", [])
        
        if not output_data:
            print("No embedding data found in output")
            return {
                'statusCode': 400,
                'body': 'No embedding data found'
            }
        
        print(f"Found {len(output_data)} embeddings to process")
        
        # Determine embedding dimension and which vector index to use based on model version
        embedding_dim = 1024  # Default dimension
        if output_data and len(output_data) > 0 and "embedding" in output_data[0]:
            embedding_dim = len(output_data[0]["embedding"])
        
        # Create unique index name for this task using a hash to keep it short
        # S3 Vector index names must be 3-63 characters
        task_hash = hashlib.md5(task_id.encode()).hexdigest()[:12]  # Use first 12 chars of hash
        
        if "3-0" in model_id or "3.0" in model_id:
            # Marengo 3.0 - dimension can vary
            index_name = f"tlabs-mme-30-{embedding_dim}-{task_hash}"
            print(f"Using Marengo 3.0 vector index: {index_name} with dimension {embedding_dim}")
        else:
            # Marengo 2.7 - typically 1024 dimension
            index_name = f"tlabs-mme-27-{embedding_dim}-{task_hash}"
            print(f"Using Marengo 2.7 vector index: {index_name} with dimension {embedding_dim}")
        
        print(f"Using task-specific vector index: {index_name} (length: {len(index_name)}) for task: {task_id}")
        
        # Ensure the index exists for this task
        try:
            ensure_vector_index_exists(TLABS_S3_VECTOR_BUCKET, index_name, embedding_dim)
        except Exception as ex:
            print(f"Error ensuring vector index exists: {ex}")
            return {
                'statusCode': 500,
                'body': f'Error creating vector index: {ex}'
            }
        
        # Add embeddings to S3 Vector: batch size 200
        embeddings = []
        batch_size = 200
        total_processed = 0
        
        for idx, o in enumerate(output_data):
            # Build embedding key
            embedding_option = o.get("embeddingOption", "unknown")
            start_sec = o.get("startSec", 0)
            end_sec = o.get("endSec", 0)
            
            embed_key = f'{task_id}_{embedding_option}_{start_sec}_{end_sec}'
            
            # Build metadata
            metadata = {
                "task_id": task_id,
                "video_id": video_id,
                "embeddingOption": embedding_option,
                "startSec": str(start_sec),
                "endSec": str(end_sec)
            }
            
            # Add embeddingScope for Marengo 3.0
            if "embeddingScope" in o:
                metadata["embeddingScope"] = o["embeddingScope"]
            
            # Build embedding vector
            embed = {
                "key": embed_key,
                "data": {"float32": o["embedding"]},
                "metadata": metadata
            }
            
            embeddings.append(embed)
            
            # Write batch when size reached or last item
            if len(embeddings) >= batch_size or idx == len(output_data) - 1:
                print(f"Writing batch of {len(embeddings)} embeddings to vector index")
                s3vectors.put_vectors(
                    vectorBucketName=TLABS_S3_VECTOR_BUCKET,
                    indexName=index_name,
                    vectors=embeddings
                )
                total_processed += len(embeddings)
                embeddings = []
        
        print(f"Successfully processed {total_processed} embeddings")
        
        # Update DynamoDB task status
        task_doc["Status"] = "completed"
        task_doc["CompletedTs"] = datetime.now(timezone.utc).isoformat()
        
        # Update result information
        if "Result" not in task_doc:
            task_doc["Result"] = {}
        
        task_doc["Result"]["EmbeddingCount"] = total_processed
        task_doc["Result"]["S3VectorBucket"] = TLABS_S3_VECTOR_BUCKET
        task_doc["Result"]["S3VectorIndex"] = index_name
        task_doc["Result"]["S3OutputKey"] = s3_key
        
        print(f"Updating task status in DynamoDB: {task_id}")
        utils.dynamodb_table_upsert(DYNAMO_VIDEO_ANALYZE_TABLE, task_doc)
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Task completed successfully',
                'task_id': task_id,
                'embeddings_processed': total_processed
            })
        }
    
    except Exception as e:
        print(f"Error processing TwelveLabs output: {str(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }


def ensure_vector_index_exists(bucket_name, index_name, dimension):
    """
    Ensure S3 Vector index exists, create if it doesn't
    
    Args:
        bucket_name: S3 Vector bucket name
        index_name: Index name to create
        dimension: Embedding dimension (e.g., 1024, 512)
    """
    try:
        # Try to create the index - if it already exists, it will raise ConflictException
        print(f"Attempting to create vector index: {index_name} with dimension {dimension}")
        s3vectors.create_index(
            vectorBucketName=bucket_name,
            indexName=index_name,
            dataType='float32',
            dimension=int(dimension),
            distanceMetric='cosine'
        )
        print(f"Successfully created new vector index: {index_name}")
        return True
    except s3vectors.exceptions.ConflictException:
        # Index already exists - this is fine
        print(f"Vector index already exists: {index_name}")
        return True
    except Exception as ex:
        print(f"Error creating/checking vector index: {ex}")
        raise ex
