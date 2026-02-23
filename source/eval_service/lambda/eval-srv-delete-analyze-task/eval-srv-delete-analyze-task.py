import json
import boto3
import os

dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')
s3vectors = boto3.client('s3vectors')

DYNAMO_VIDEO_ANALYZE_TABLE = os.environ.get('DYNAMO_VIDEO_ANALYZE_TABLE')
S3_VECTOR_BUCKET = os.environ.get('S3_VECTOR_BUCKET')

# CORS headers for all responses
CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'DELETE,OPTIONS'
}

def lambda_handler(event, context):
    """
    Delete analyze task from DynamoDB, S3 output files, and S3 vectors
    """
    try:
        print(f"Received event: {json.dumps(event)}")
        
        # Parse body from API Gateway event
        if 'body' in event:
            if isinstance(event['body'], str):
                body = json.loads(event['body'])
            else:
                body = event['body']
        else:
            # Direct invocation
            body = event
            
        print(f"Parsed body: {json.dumps(body)}")
        
        # Validate required fields
        task_id = body.get('TaskId') or body.get('task_id') or body.get('Id') or body.get('id')
        if not task_id:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'Missing required field: TaskId or Id'})
            }
        
        # Get task metadata from DynamoDB
        analyze_table = dynamodb.Table(DYNAMO_VIDEO_ANALYZE_TABLE)
        
        print(f"Fetching task metadata for Id: {task_id}")
        
        # Scan to find the task (since we might not know the Type)
        response = analyze_table.query(
            KeyConditionExpression='Id = :task_id',
            ExpressionAttributeValues={':task_id': task_id}
        )
        
        items = response.get('Items', [])
        if not items:
            return {
                'statusCode': 404,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': f'Task not found: {task_id}'})
            }
        
        task_item = items[0]
        task_type = task_item.get('Type')
        video_id = task_item.get('VideoId')
        
        print(f"Found task: {task_id}, Type: {task_type}, VideoId: {video_id}")
        
        # Get S3 information from task result
        result = task_item.get('Result', {})
        s3_bucket = result.get('S3BucketResult')
        s3_output_prefix = result.get('S3OutputPrefix')
        s3_vector_bucket = result.get('S3VectorBucket') or S3_VECTOR_BUCKET
        s3_vector_index = result.get('S3VectorIndex')
        
        deletion_summary = {
            'task_id': task_id,
            'task_type': task_type,
            'video_id': video_id,
            'deleted_s3_objects': 0,
            'deleted_index': False,
            'errors': []
        }
        
        # Delete S3 output files
        if s3_bucket and s3_output_prefix:
            try:
                deleted_count = delete_s3_folder(s3_bucket, s3_output_prefix)
                deletion_summary['deleted_s3_objects'] = deleted_count
                print(f"Deleted {deleted_count} S3 objects from {s3_output_prefix}")
            except Exception as ex:
                error_msg = f"Error deleting S3 objects: {str(ex)}"
                print(error_msg)
                deletion_summary['errors'].append(error_msg)
        
        # Delete vectors from S3 Vector index
        if s3_vector_bucket and s3_vector_index:
            try:
                deleted_index = delete_task_vectors(
                    s3_vector_bucket, 
                    s3_vector_index, 
                    task_id,
                    task_type
                )
                deletion_summary['deleted_index'] = bool(deleted_index)
                if deleted_index:
                    print(f"Deleted S3 Vector index: {s3_vector_index}")
            except Exception as ex:
                error_msg = f"Error deleting vector index: {str(ex)}"
                print(error_msg)
                deletion_summary['errors'].append(error_msg)
        
        # Delete from DynamoDB analyze table
        print(f"Deleting task from DynamoDB: {task_id} (Type: {task_type})")
        analyze_table.delete_item(
            Key={
                'Id': task_id,
                'Type': task_type
            }
        )
        
        deletion_summary['message'] = 'Task deleted successfully'
        
        print(f"Delete operation completed: {json.dumps(deletion_summary, default=str)}")
        
        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps(deletion_summary, default=str)
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


def delete_s3_folder(s3_bucket, s3_prefix):
    """
    Delete all objects under the specified S3 prefix
    Returns the count of deleted objects
    """
    deleted_count = 0
    
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
                        deleted_count += len(delete_response['Deleted'])
                        for deleted in delete_response['Deleted']:
                            print(f"Deleted: {deleted['Key']}")
                    
                    # Log failed deletions
                    if 'Errors' in delete_response:
                        for error in delete_response['Errors']:
                            print(f"Failed to delete {error['Key']}: {error['Message']}")
    
    except Exception as e:
        print(f"Error deleting S3 objects: {str(e)}")
        raise
    
    return deleted_count


def delete_task_vectors(s3_vector_bucket, s3_vector_index, task_id, task_type):
    """
    Delete the entire S3 Vector index associated with this task
    Returns 1 if index was deleted, 0 otherwise
    """
    try:
        print(f"Deleting S3 Vector index: {s3_vector_index} from bucket: {s3_vector_bucket}")
        
        # Delete the entire index
        s3vectors.delete_index(
            vectorBucketName=s3_vector_bucket,
            indexName=s3_vector_index
        )
        
        print(f"Successfully deleted S3 Vector index: {s3_vector_index}")
        return 1
        
    except s3vectors.exceptions.ResourceNotFoundException:
        print(f"Vector index not found: {s3_vector_index}")
        return 0
    except Exception as ex:
        print(f"Error deleting vector index: {ex}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return 0
