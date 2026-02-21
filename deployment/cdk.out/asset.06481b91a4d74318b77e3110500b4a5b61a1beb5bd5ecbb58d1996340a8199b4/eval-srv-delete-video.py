import json
import boto3
import os

dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')
table_name = os.environ.get('DYNAMO_VIDEO_TABLE')
video_upload_s3_prefix = os.environ.get('VIDEO_UPLOAD_S3_PREFIX', 'upload')
table = dynamodb.Table(table_name)

def lambda_handler(event, context):
    """
    Delete video from DynamoDB and S3
    """
    try:
        # Log the incoming event for debugging
        print(f"Received event: {json.dumps(event)}")
        
        # Parse body - handle both string and dict, similar to other lambdas
        body_raw = event
        if isinstance(body_raw, str):
            body = json.loads(body_raw)
        else:
            body = body_raw
            
        print(f"Parsed body: {json.dumps(body)}")
        
        # Validate required fields
        video_id = body.get('id')
        if not video_id:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Missing required field: id'})
            }
        
        # Get video metadata from DynamoDB
        print(f"Fetching video metadata for id: {video_id}")
        response = table.get_item(Key={'Id': video_id})
        
        if 'Item' not in response:
            return {
                'statusCode': 404,
                'body': json.dumps({'error': f'Video not found: {video_id}'})
            }
        
        video_item = response['Item']
        s3_bucket = video_item.get('s3_bucket')
        
        if not s3_bucket:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Video item missing s3_bucket information'})
            }
        
        # Construct the S3 prefix for this video: tasks/{video_id}/
        s3_prefix = f'tasks/{video_id}/'
        
        print(f"Deleting all objects under s3://{s3_bucket}/{s3_prefix}")
        
        # List and delete all objects under the prefix
        deleted_objects = []
        failed_deletions = []
        
        try:
            # List all objects with the prefix
            paginator = s3.get_paginator('list_objects_v2')
            pages = paginator.paginate(Bucket=s3_bucket, Prefix=s3_prefix)
            
            for page in pages:
                if 'Contents' not in page:
                    continue
                    
                # Delete objects in batches
                objects_to_delete = [{'Key': obj['Key']} for obj in page['Contents']]
                
                if objects_to_delete:
                    delete_response = s3.delete_objects(
                        Bucket=s3_bucket,
                        Delete={'Objects': objects_to_delete}
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
                                'key': error['Key'],
                                'error': error['Message']
                            })
                            print(f"Failed to delete {error['Key']}: {error['Message']}")
        
        except Exception as e:
            print(f"Error deleting S3 objects: {str(e)}")
            failed_deletions.append({'error': str(e)})
        
        # Delete from DynamoDB
        print(f"Deleting video metadata from DynamoDB: {video_id}")
        table.delete_item(Key={'Id': video_id})
        
        result = {
            'message': 'Video deleted successfully',
            'id': video_id,
            'deleted_objects': deleted_objects
        }
        
        if failed_deletions:
            result['failed_deletions'] = failed_deletions
            result['message'] = 'Video deleted with some S3 deletion failures'
        
        print(f"Delete operation completed: {json.dumps(result)}")
        
        return {
            'statusCode': 200,
            'body': json.dumps(result)
        }
    
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
