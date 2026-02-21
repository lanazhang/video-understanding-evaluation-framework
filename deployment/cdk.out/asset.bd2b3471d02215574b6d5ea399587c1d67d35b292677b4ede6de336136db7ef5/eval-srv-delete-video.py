import json
import boto3
import os

dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')
table_name = os.environ.get('DYNAMO_VIDEO_TABLE')
table = dynamodb.Table(table_name)

def lambda_handler(event, context):
    """
    Delete video from DynamoDB and S3
    """
    try:
        # Log the incoming event for debugging
        print(f"Received event: {json.dumps(event)}")
        
        # Parse body - handle both string and dict
        body_raw = event.get('body', '{}')
        if isinstance(body_raw, str):
            body = json.loads(body_raw) if body_raw else {}
        else:
            body = body_raw or {}
            
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
        s3_key_video = video_item.get('s3_key_video')
        s3_key_thumbnail = video_item.get('s3_key_thumbnail')
        
        # Delete S3 objects
        deleted_objects = []
        failed_deletions = []
        
        if s3_bucket and s3_key_video:
            try:
                print(f"Deleting video from S3: s3://{s3_bucket}/{s3_key_video}")
                s3.delete_object(Bucket=s3_bucket, Key=s3_key_video)
                deleted_objects.append(s3_key_video)
            except Exception as e:
                print(f"Failed to delete video from S3: {str(e)}")
                failed_deletions.append({'key': s3_key_video, 'error': str(e)})
        
        if s3_bucket and s3_key_thumbnail:
            try:
                print(f"Deleting thumbnail from S3: s3://{s3_bucket}/{s3_key_thumbnail}")
                s3.delete_object(Bucket=s3_bucket, Key=s3_key_thumbnail)
                deleted_objects.append(s3_key_thumbnail)
            except Exception as e:
                print(f"Failed to delete thumbnail from S3: {str(e)}")
                failed_deletions.append({'key': s3_key_thumbnail, 'error': str(e)})
        
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
