import json
import boto3
import os
from datetime import datetime
import uuid

s3_client = boto3.client('s3')
BUCKET_NAME = os.environ.get('VIDEO_UPLOAD_S3_BUCKET')
S3_PREFIX = os.environ.get('VIDEO_UPLOAD_S3_PREFIX', 'upload')
PRESIGNED_URL_EXPIRY = int(os.environ.get('S3_PRESIGNED_URL_EXPIRY_S', '3600'))

def get_cors_headers():
    """Return CORS headers for API responses"""
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    }

def lambda_handler(event, context):
    """
    Manage S3 presigned URLs for multipart upload
    Actions: create, complete, abort
    """
    # Handle OPTIONS request for CORS preflight
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({'message': 'OK'})
        }
    
    try:
        body = json.loads(event.get('body', '{}'))
        action = body.get('Action', '').lower()
        
        if action == 'create':
            return handle_create_multipart_upload(body)
        elif action == 'complete':
            return handle_complete_multipart_upload(body)
        elif action == 'abort':
            return handle_abort_multipart_upload(body)
        else:
            return {
                'statusCode': 400,
                'headers': get_cors_headers(),
                'body': json.dumps({'error': 'Invalid action. Use: create, complete, or abort'})
            }
    
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': get_cors_headers(),
            'body': json.dumps({'error': str(e)})
        }


def handle_create_multipart_upload(body):
    """
    Create multipart upload and generate presigned URLs for each part
    """
    file_name = body.get('FileName')
    num_parts = body.get('NumParts', 1)
    
    if not file_name:
        return {
            'statusCode': 400,
            'headers': get_cors_headers(),
            'body': json.dumps({'error': 'FileName is required'})
        }
    
    # Generate unique task ID and S3 key
    task_id = str(uuid.uuid4())
    s3_key = f"{S3_PREFIX}/{task_id}/{file_name}"
    
    # Initiate multipart upload
    multipart_upload = s3_client.create_multipart_upload(
        Bucket=BUCKET_NAME,
        Key=s3_key,
        ContentType='video/mp4'
    )
    
    upload_id = multipart_upload['UploadId']
    
    # Generate presigned URLs for each part
    upload_part_urls = []
    for part_number in range(1, num_parts + 1):
        presigned_url = s3_client.generate_presigned_url(
            'upload_part',
            Params={
                'Bucket': BUCKET_NAME,
                'Key': s3_key,
                'UploadId': upload_id,
                'PartNumber': part_number
            },
            ExpiresIn=PRESIGNED_URL_EXPIRY
        )
        upload_part_urls.append(presigned_url)
    
    return {
        'statusCode': 200,
        'headers': get_cors_headers(),
        'body': json.dumps({
            'TaskId': task_id,
            'UploadId': upload_id,
            'S3Bucket': BUCKET_NAME,
            'S3Key': s3_key,
            'UploadPartUrls': upload_part_urls,
            'UploadUrl': f"s3://{BUCKET_NAME}/{s3_key}"
        })
    }


def handle_complete_multipart_upload(body):
    """
    Complete the multipart upload
    """
    task_id = body.get('TaskId')
    file_name = body.get('FileName')
    upload_id = body.get('UploadId')
    multipart_upload = body.get('MultipartUpload', [])
    
    if not all([task_id, file_name, upload_id, multipart_upload]):
        return {
            'statusCode': 400,
            'headers': get_cors_headers(),
            'body': json.dumps({'error': 'TaskId, FileName, UploadId, and MultipartUpload are required'})
        }
    
    s3_key = f"{S3_PREFIX}/{task_id}/{file_name}"
    
    # Complete the multipart upload
    response = s3_client.complete_multipart_upload(
        Bucket=BUCKET_NAME,
        Key=s3_key,
        UploadId=upload_id,
        MultipartUpload={
            'Parts': multipart_upload
        }
    )
    
    return {
        'statusCode': 200,
        'headers': get_cors_headers(),
        'body': json.dumps({
            'TaskId': task_id,
            'S3Bucket': BUCKET_NAME,
            'S3Key': s3_key,
            'ETag': response.get('ETag'),
            'Location': response.get('Location')
        })
    }


def handle_abort_multipart_upload(body):
    """
    Abort the multipart upload
    """
    task_id = body.get('TaskId')
    file_name = body.get('FileName')
    upload_id = body.get('UploadId')
    
    if not all([task_id, file_name, upload_id]):
        return {
            'statusCode': 400,
            'headers': get_cors_headers(),
            'body': json.dumps({'error': 'TaskId, FileName, and UploadId are required'})
        }
    
    s3_key = f"{S3_PREFIX}/{task_id}/{file_name}"
    
    # Abort the multipart upload
    s3_client.abort_multipart_upload(
        Bucket=BUCKET_NAME,
        Key=s3_key,
        UploadId=upload_id
    )
    
    return {
        'statusCode': 200,
        'headers': get_cors_headers(),
        'body': json.dumps({
            'message': 'Multipart upload aborted successfully',
            'TaskId': task_id
        })
    }
