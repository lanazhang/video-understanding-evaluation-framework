"""
S3 Listener Lambda Function
Triggered by EventBridge when .jsonl files are created in S3
1. Read embedding results from S3
2. Create unique S3 Vector index for the video (if not exists)
3. Store embeddings in S3 Vector index
4. Update DynamoDB task status
"""
import json
import boto3
import os
import utils
import hashlib
from datetime import datetime, timezone
from decimal import Decimal

DYNAMO_VIDEO_TABLE = os.environ.get("DYNAMO_VIDEO_TABLE")
DYNAMO_VIDEO_ANALYZE_TABLE = os.environ.get("DYNAMO_VIDEO_ANALYZE_TABLE")
S3_VECTOR_BUCKET = os.environ.get("S3_VECTOR_BUCKET")
S3_VECTOR_INDEX = os.environ.get("S3_VECTOR_INDEX")
DYNAMO_VIDEO_USAGE_TABLE = os.environ.get("DYNAMO_VIDEO_USAGE_TABLE")
MODEL_ID_BEDROCK_MME = os.environ.get("MODEL_ID_BEDROCK_MME")

s3 = boto3.client('s3')
s3vectors = boto3.client('s3vectors')


class DecimalEncoder(json.JSONEncoder):
    """Helper class to convert Decimal to float for JSON serialization"""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)


def lambda_handler(event, context):
    print(json.dumps(event))
    
    if event is None or "detail" not in event:
        return {
            'statusCode': 400,
            'body': 'Invalid trigger'
        }
    
    s3_bucket, s3_key, video_id, task_id = None, None, None, None
    
    try:
        s3_bucket = event["detail"]["bucket"]["name"]
        s3_key = event["detail"]["object"]["key"]
        # Extract video_id from path: tasks/{video_id}/video-analyze/{task_id}/*.jsonl
        video_id = s3_key.split('/')[1]
        task_id = s3_key.split('/')[3]
    except Exception as ex:
        print(f"Error parsing S3 trigger: {ex}")
        return {
            'statusCode': 400,
            'body': f'Error parsing S3 trigger: {ex}'
        }

    # Ignore search triggers - they are managed differently
    if '/video-analyze/search/' in s3_key:
        return {
            'statusCode': 200,
            'body': 'Search trigger. Ignored.'
        }
    
    # Ignore temporary placeholder files
    if s3_key.endswith('.tmp'):
        print(f"Ignoring temporary file: {s3_key}")
        return {
            'statusCode': 200,
            'body': 'Temporary file. Ignored.'
        }
    
    # Only process .jsonl files that start with "embedding-"
    filename = s3_key.split('/')[-1]
    if not filename.startswith('embedding-') or not filename.endswith('.jsonl'):
        print(f"Ignoring non-embedding file: {s3_key}")
        return {
            'statusCode': 200,
            'body': 'Not an embedding file. Ignored.'
        }
    
    if not s3_bucket or not s3_key or not video_id:
        return {
            'statusCode': 400,
            'body': 'Invalid trigger - missing required parameters'
        }
    
    # Get embedding result from S3 with retry logic
    max_retries = 3
    retry_delay = 2  # seconds
    content = None
    
    for attempt in range(max_retries):
        try:
            print(f"Attempting to read S3 object (attempt {attempt + 1}/{max_retries}): s3://{s3_bucket}/{s3_key}")
            obj = s3.get_object(Bucket=s3_bucket, Key=s3_key)
            content = obj['Body'].read().decode('utf-8')
            print(f"Successfully read S3 object, size: {len(content)} bytes")
            break
        except s3.exceptions.NoSuchKey:
            print(f"File not found (attempt {attempt + 1}/{max_retries}): {s3_key}")
            if attempt < max_retries - 1:
                import time
                time.sleep(retry_delay)
            else:
                print(f"File still not found after {max_retries} attempts, skipping")
                return {
                    'statusCode': 404,
                    'body': f'File not found after {max_retries} attempts: {s3_key}'
                }
        except Exception as ex:
            print(f"Error reading S3 object (attempt {attempt + 1}/{max_retries}): {ex}")
            if attempt < max_retries - 1:
                import time
                time.sleep(retry_delay)
            else:
                return {
                    'statusCode': 500,
                    'body': f'Error reading S3 object: {ex}'
                }
    
    # Parse embeddings from JSONL file
    data = []
    embed_name = s3_key.split('/')[-1].replace(".jsonl", "").replace("embedding-", "")
    
    for line in content.split('\n'):
        if line.strip():
            try:
                embed = json.loads(line)
                if "segmentMetadata" in embed:
                    embed["segmentMetadata"]["type"] = embed_name
                    data.append(embed)
                else:
                    print(f"Missing segmentMetadata in line: {line}")
            except json.JSONDecodeError as ex:
                print(f"Error parsing JSON line: {ex}")
                continue
    
    if not data:
        print("No valid embeddings found in file")
        return {
            'statusCode': 400,
            'body': 'No valid embeddings found'
        }
    
    # Add embeddings to S3 Vector: batch size 200
    # Create unique index name for this video using a hash to keep it short
    # S3 Vector index names must be 3-63 characters
    video_hash = hashlib.md5(task_id.encode()).hexdigest()[:12]  # Use first 12 chars of hash
    video_index_name = f"nova-mme-1024-{video_hash}"  # Format: nova-mme-1024-{12-char-hash} = ~28 chars
    
    print(f"Using video index name: {video_index_name} (length: {len(video_index_name)}) for video task: {task_id}")
    
    # Ensure the index exists for this video
    try:
        ensure_vector_index_exists(S3_VECTOR_BUCKET, video_index_name, 1024)
    except Exception as ex:
        print(f"Error ensuring vector index exists: {ex}")
        return {
            'statusCode': 500,
            'body': f'Error creating vector index: {ex}'
        }
    
    embeddings, batch_size, counter = [], 200, 0
    
    for o in data:
        embeddings.append({
            "key": f'{task_id}_{o["segmentMetadata"]["type"]}_{o["segmentMetadata"]["segmentIndex"]}',
            "data": {"float32": o["embedding"]},
            "metadata": {
                "video_id": video_id,
                "embeddingOption": o["segmentMetadata"]["type"],
                "startSec": str(o["segmentMetadata"]["segmentStartSeconds"]),
                "endSec": str(o["segmentMetadata"]["segmentEndSeconds"])
            }
        })
        counter += 1
        
        if len(embeddings) >= batch_size or counter >= len(data):
            # Write embeddings into video-specific vector index with metadata
            try:
                s3vectors.put_vectors(
                    vectorBucketName=S3_VECTOR_BUCKET,
                    indexName=video_index_name,
                    vectors=embeddings
                )
                print(f"Successfully wrote {len(embeddings)} embeddings to S3 Vector index: {video_index_name}")
            except Exception as ex:
                print(f"Error writing to S3 Vector: {ex}")
                return {
                    'statusCode': 500,
                    'body': f'Error writing to S3 Vector: {ex}'
                }
            embeddings = []
    
    # Update DynamoDB video status
    try:
        doc = utils.dynamodb_get_by_id(DYNAMO_VIDEO_TABLE, id=video_id)
        if doc is not None:
            # Update video status
            doc["Status"] = "completed"
            doc["EmbedCompleteTs"] = datetime.now(timezone.utc).isoformat()
            doc["Id"] = video_id
            
            print(f"Updating video {video_id} with status: completed")
            
            # Update DB: video table
            utils.dynamodb_table_upsert(DYNAMO_VIDEO_TABLE, doc)
            
            # Store usage
            duration_s = doc.get("MetaData", {}).get("VideoMetaData", {}).get("Duration", 0)
            if not duration_s:
                duration_s = doc.get("Duration", 0)
            
            # Convert Decimal to float for usage tracking
            if isinstance(duration_s, Decimal):
                duration_s = float(duration_s)
            
            #update_usage_to_db(video_id, MODEL_ID_BEDROCK_MME, duration_s)
            
            print(f"Successfully updated video {video_id} status to completed")
        else:
            print(f"Video document not found for id: {video_id}")
    except Exception as ex:
        print(f'Error updating DynamoDB: {ex}')
        import traceback
        print(f'Traceback: {traceback.format_exc()}')
        return {
            'statusCode': 500,
            'body': f'Error updating DynamoDB: {str(ex)}'
        }
    
    # Update task status in analyze table
    try:
        # Use explicit analyze table name from environment variable, fallback to derived name
        analyze_table_name = DYNAMO_VIDEO_ANALYZE_TABLE
        if not analyze_table_name:
            analyze_table_name = DYNAMO_VIDEO_TABLE.replace('_video', '_analyze_table')
            print(f"Warning: DYNAMO_VIDEO_ANALYZE_TABLE not set, using derived name: {analyze_table_name}")
        
        print(f"Querying analyze table: {analyze_table_name} for VideoId: {video_id}")
        tasks = utils.dynamodb_query_by_index(
            analyze_table_name,
            'VideoId-index',
            'VideoId',
            video_id
        )
        
        print(f"Found {len(tasks)} tasks for video {video_id}")
        
        # Update the most recent processing task
        for task in tasks:
            print(f"Updating task {task.get('Id')} to completed status")
            
            # Update status and completion timestamp
            task['Status'] = 'completed'
            task['CompletedTs'] = datetime.now(timezone.utc).isoformat()
            
            # Ensure Result object exists and update it
            if 'Result' not in task or not isinstance(task['Result'], dict):
                task['Result'] = {}
            
            # Update Result fields
            task['Result']['EmbeddingCount'] = len(data)
            
            # Calculate processing time if StartedTs exists
            if 'StartedTs' in task:
                try:
                    started = datetime.fromisoformat(task['StartedTs'].replace('Z', '+00:00'))
                    completed = datetime.now(timezone.utc)
                    processing_time = (completed - started).total_seconds()
                    task['Result']['ProcessingTimeS'] = processing_time
                except Exception as ex:
                    print(f"Error calculating processing time: {ex}")
            
            # Set S3 output information in Result
            task['Result']['S3BucketResult'] = s3_bucket
            task['Result']['S3OutputPrefix'] = '/'.join(s3_key.split('/')[:-1]) + '/'
            
            # Set S3 Vector information in Result
            task['Result']['S3VectorBucket'] = S3_VECTOR_BUCKET
            task['Result']['S3VectorIndex'] = video_index_name
            task['Result']['VideoId'] = video_id  # Store video ID for reference
            
            # Save updated task
            utils.dynamodb_table_upsert(analyze_table_name, task)
            print(f"Successfully updated task {task['Id']} - Status: completed, EmbeddingCount: {len(data)}, S3VectorBucket: {S3_VECTOR_BUCKET}, S3VectorIndex: {video_index_name}")
            break
        else:
            print(f"No processing tasks found for video {video_id}")
    except Exception as ex:
        print(f'Error updating task status: {ex}')
        import traceback
        print(f'Traceback: {traceback.format_exc()}')
        # Don't fail the whole operation if task update fails
    
    return {
        'statusCode': 200,
        'body': f'Successfully processed embeddings for video {video_id}'
    }


def update_usage_to_db(video_id, model_id, duration_s):
    """Store usage information in DynamoDB"""
    usage = {
        "id": f"{video_id}_video_analyze",
        "index": None,
        "type": "video_analyze_mme",
        "name": None,
        "video_id": video_id,
        "model_id": model_id,
        "duration_s": duration_s,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    utils.dynamodb_table_upsert(DYNAMO_VIDEO_USAGE_TABLE, usage)
    return usage


def ensure_vector_index_exists(bucket_name, index_name, dimension):
    """
    Ensure S3 Vector index exists, create if it doesn't
    
    Args:
        bucket_name: S3 Vector bucket name
        index_name: Index name to create
        dimension: Embedding dimension (e.g., 1024)
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

