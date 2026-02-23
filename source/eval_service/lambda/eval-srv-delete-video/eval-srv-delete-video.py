import json
import boto3
import os
import hashlib

dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')
s3vectors = boto3.client('s3vectors')

DYNAMO_VIDEO_TABLE = os.environ.get('DYNAMO_VIDEO_TABLE')
DYNAMO_VIDEO_ANALYZE_TABLE = os.environ.get('DYNAMO_VIDEO_ANALYZE_TABLE')
S3_VECTOR_BUCKET = os.environ.get('S3_VECTOR_BUCKET')
S3_VECTOR_INDEX = os.environ.get('S3_VECTOR_INDEX')

video_table = dynamodb.Table(DYNAMO_VIDEO_TABLE)

# CORS headers for all responses
CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'DELETE,OPTIONS'
}

def lambda_handler(event, context):
    """
    Delete video from DynamoDB (video and analyze tables), S3, and S3 vectors
    """
    try:
        # Log the incoming event for debugging
        print(f"Received event: {json.dumps(event)}")
        
        # Parse body - handle both string and dict
        body_raw = event
        if isinstance(body_raw, str):
            body = json.loads(body_raw)
        else:
            body = body_raw
            
        print(f"Parsed body: {json.dumps(body)}")
        
        # Validate required fields - accept PascalCase
        video_id = body.get('Id') or body.get('id')
        if not video_id:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'Missing required field: Id'})
            }
        
        # Get video metadata from DynamoDB
        print(f"Fetching video metadata for Id: {video_id}")
        response = video_table.get_item(Key={'Id': video_id})
        
        if 'Item' not in response:
            return {
                'statusCode': 404,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': f'Video not found: {video_id}'})
            }
        
        video_item = response['Item']
        s3_bucket = video_item.get('S3Bucket')
        
        if not s3_bucket:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'Video item missing S3Bucket information'})
            }
        
        # Construct the S3 prefix for this video: tasks/{video_id}/
        s3_prefix = f'tasks/{video_id}/'
        output_prefix = f'tasks/{video_id}/video-analyze/'
        
        print(f"Deleting all objects under s3://{s3_bucket}/{s3_prefix}")
        
        # Delete S3 vectors
        deleted_vectors = delete_s3_vectors(s3_bucket, output_prefix, S3_VECTOR_BUCKET, S3_VECTOR_INDEX, video_id)
        
        # Delete S3 objects
        deleted_objects, failed_deletions = delete_s3_folder(s3_bucket, s3_prefix)
        
        # Delete from analyze table
        deleted_tasks = delete_from_analyze_table(video_id)
        
        # Delete from video table
        print(f"Deleting video metadata from DynamoDB: {video_id}")
        video_table.delete_item(Key={'Id': video_id})
        
        result = {
            'message': 'Video deleted successfully',
            'Id': video_id,
            'DeletedObjects': len(deleted_objects),
            'DeletedVectors': deleted_vectors,
            'DeletedTasks': deleted_tasks
        }
        
        if failed_deletions:
            result['FailedDeletions'] = failed_deletions
            result['message'] = 'Video deleted with some S3 deletion failures'
        
        print(f"Delete operation completed: {json.dumps(result, default=str)}")
        
        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps(result, default=str)
        }
    
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': str(e)})
        }


def delete_s3_vectors(output_s3_bucket, output_s3_prefix, s3_vector_bucket, s3_vector_index, video_id):
    """
    Delete vectors from S3 Vector index and delete the video-specific index
    """
    if not s3_vector_bucket or not s3_vector_index:
        print("S3 Vector bucket or index not configured, skipping vector deletion")
        return 0
    
    # Construct video-specific index name using the same hashing scheme as creation
    video_hash = hashlib.md5(video_id.encode()).hexdigest()[:12]
    video_index_name = f"nova-mme-1024-{video_hash}"
    
    print(f"Attempting to delete video index: {video_index_name} for video: {video_id}")
    
    try:
        # Try to delete the video-specific index
        try:
            print(f"Attempting to delete video-specific index: {video_index_name}")
            s3vectors.delete_index(
                vectorBucketName=s3_vector_bucket,
                indexName=video_index_name
            )
            print(f"Successfully deleted index: {video_index_name}")
            return 1  # Return 1 to indicate index was deleted
            
        except s3vectors.exceptions.NotFoundException:
            print(f"Video-specific index not found: {video_index_name}, attempting legacy deletion")
            
            # Fallback: try to delete vectors from the shared index (legacy behavior)
            response = s3.list_objects_v2(Bucket=output_s3_bucket, Prefix=output_s3_prefix)
            
            keys = []
            
            # Process each .jsonl file to extract vector keys
            for obj in response.get('Contents', []):
                if obj['Key'].endswith('.jsonl'):
                    output_key = obj['Key']
                    embed_name = output_key.split('/')[-1].replace(".jsonl", "").replace("embedding-", "")
                    
                    print(f"Processing embedding file: {output_key}")
                    
                    # Read the jsonl file
                    obj_data = s3.get_object(Bucket=output_s3_bucket, Key=output_key)
                    content = obj_data['Body'].read().decode('utf-8')
                    
                    # Parse each line to get segment indices
                    for line in content.split('\n'):
                        if line.strip():
                            try:
                                embed = json.loads(line)
                                # Construct vector key: {video_id}_{embed_type}_{segment_index}
                                key = f'{video_id}_{embed_name}_{embed["segmentMetadata"]["segmentIndex"]}'
                                if key not in keys:
                                    keys.append(key)
                            except json.JSONDecodeError as ex:
                                print(f"Error parsing JSON line: {ex}")
                                continue
            
            # Delete vectors from shared S3 Vector index
            if keys:
                print(f"Deleting {len(keys)} vectors from shared S3 Vector index")
                response = s3vectors.delete_vectors(
                    vectorBucketName=s3_vector_bucket,
                    indexName=s3_vector_index,
                    keys=keys
                )
                print(f"Successfully deleted {len(keys)} vectors")
                return len(keys)
            else:
                print("No vectors found to delete")
                return 0
            
    except Exception as ex:
        print(f"Error deleting S3 vectors: {ex}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return 0


def delete_s3_folder(s3_bucket, s3_prefix):
    """
    Delete all objects under the specified S3 prefix
    """
    deleted_objects = []
    failed_deletions = []
    
    try:
        # List all objects with the prefix
        paginator = s3.get_paginator('list_objects_v2')
        pages = paginator.paginate(Bucket=s3_bucket, Prefix=s3_prefix)
        
        for page in pages:
            if 'Contents' not in page:
                continue
                
            # Delete objects in batches of 1000 (S3 limit)
            objects_to_delete = [{'Key': obj['Key']} for obj in page['Contents']]
            
            # Process in batches of 1000
            for i in range(0, len(objects_to_delete), 1000):
                batch = objects_to_delete[i:i+1000]
                
                if batch:
                    delete_response = s3.delete_objects(
                        Bucket=s3_bucket,
                        Delete={'Objects': batch}
                    )
                    
                    # Track successful deletions
                    if 'Deleted' in delete_response:
                        for deleted in delete_response['Deleted']:
                            deleted_objects.append(deleted['Key'])
                            print(f"Deleted: {deleted['Key']}")
                    
                    # Track failed deletions
                    if 'Errors' in delete_response:
                        for error in delete_response['Errors']:
                            failed_deletions.append({
                                'Key': error['Key'],
                                'Error': error['Message']
                            })
                            print(f"Failed to delete {error['Key']}: {error['Message']}")
    
    except Exception as e:
        print(f"Error deleting S3 objects: {str(e)}")
        failed_deletions.append({'Error': str(e)})
    
    return deleted_objects, failed_deletions


def delete_from_analyze_table(video_id):
    """
    Delete all tasks associated with the video from the analyze table
    """
    if not DYNAMO_VIDEO_ANALYZE_TABLE:
        print("DYNAMO_VIDEO_ANALYZE_TABLE not configured, skipping analyze table deletion")
        return 0
    
    try:
        analyze_table = dynamodb.Table(DYNAMO_VIDEO_ANALYZE_TABLE)
        
        # Query for all tasks with this VideoId using GSI
        print(f"Querying analyze table for VideoId: {video_id}")
        response = analyze_table.query(
            IndexName='VideoId-index',
            KeyConditionExpression='VideoId = :video_id',
            ExpressionAttributeValues={':video_id': video_id}
        )
        
        tasks = response.get('Items', [])
        print(f"Found {len(tasks)} tasks to delete from analyze table")
        
        # Delete each task
        deleted_count = 0
        for task in tasks:
            try:
                # Delete using primary key (Id and Type)
                analyze_table.delete_item(
                    Key={
                        'Id': task['Id'],
                        'Type': task['Type']
                    }
                )
                print(f"Deleted task {task['Id']} (Type: {task['Type']}) from analyze table")
                deleted_count += 1
            except Exception as ex:
                print(f"Error deleting task {task.get('Id')}: {ex}")
        
        return deleted_count
        
    except Exception as ex:
        print(f"Error deleting from analyze table: {ex}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return 0
