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
            
            # Extract task_id from S3 key path: tasks/{video_id}/video-analyze/{task_id}/...
            path_parts = s3_key.split('/')
            if len(path_parts) < 4:
                return {
                    'statusCode': 400,
                    'body': f'Invalid S3 key format: {s3_key}'
                }
            
            task_id = path_parts[3]  # tasks/video_id/video-analyze/task_id/...
            
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
        
        # Get task details from DynamoDB
        task_doc = utils.dynamodb_get_by_id(DYNAMO_VIDEO_ANALYZE_TABLE, id=task_id)
        if not task_doc:
            print(f"Task not found in DynamoDB: {task_id}")
            return {
                'statusCode': 404,
                'body': f'Task not found: {task_id}'
            }
        
        video_id = task_doc.get('VideoId')
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
        
        # Determine which vector index to use based on model version
        if "3-0" in model_id or "3.0" in model_id:
            index_name = TLABS_S3_VECTOR_INDEX_30
            print(f"Using Marengo 3.0 vector index: {index_name}")
        else:
            index_name = TLABS_S3_VECTOR_INDEX
            print(f"Using Marengo 2.7 vector index: {index_name}")
        
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
