import json
import boto3
import os
from moviepy import VideoFileClip
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')
table_name = os.environ.get('DYNAMO_VIDEO_TABLE')
table = dynamodb.Table(table_name)
local_path = '/tmp/'

def lambda_handler(event, context):
    """
    Download video, extract metadata, generate thumbnail, and update DynamoDB
    """
    try:
        print(f"Received event: {json.dumps(event)}")
        
        # Parse event - accept PascalCase
        video_id = event.get('Id')
        s3_bucket = event.get('S3Bucket')
        s3_key_video = event.get('S3KeyVideo')
        
        if not all([video_id, s3_bucket, s3_key_video]):
            raise ValueError("Missing required fields: Id, S3Bucket, S3KeyVideo")
        
        # Download video to local disk
        video_filename = s3_key_video.split('/')[-1]
        local_file_path = local_path + video_filename
        
        print(f"Downloading video from s3://{s3_bucket}/{s3_key_video}")
        s3.download_file(s3_bucket, s3_key_video, local_file_path)
        
        # Extract video metadata and generate thumbnail
        video_metadata = get_video_metadata(s3_bucket, s3_key_video, local_file_path)
        
        # Update DynamoDB with metadata
        print(f"Updating DynamoDB with metadata for video {video_id}")
        table.update_item(
            Key={'Id': video_id},
            UpdateExpression='SET #dur = :duration, Resolution = :resolution, Fps = :fps, #sz = :size, S3KeyThumbnail = :thumbnail',
            ExpressionAttributeNames={
                '#dur': 'Duration',  # 'Duration' is a reserved keyword
                '#sz': 'Size'  # 'Size' is a reserved keyword
            },
            ExpressionAttributeValues={
                ':duration': Decimal(str(video_metadata['Duration'])),
                ':resolution': video_metadata['Resolution'],
                ':fps': Decimal(str(video_metadata['Fps'])),
                ':size': video_metadata['Size'],
                ':thumbnail': video_metadata['ThumbnailS3Key']
            }
        )
        
        print(f"Successfully updated metadata for video {video_id}")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Video metadata updated successfully',
                'Id': video_id,
                'MetaData': video_metadata
            }, default=str)
        }
    
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }

def get_video_metadata(s3_bucket, s3_key_video, file_path):
    """
    Extract video metadata and generate thumbnail
    """
    video_filename = s3_key_video.split('/')[-1]
    name_without_ext = video_filename.rsplit('.', 1)[0]
    
    # Thumbnail paths
    thumbnail_local_path = f'{local_path}thumbnail.jpeg'
    base_path = s3_key_video.rsplit('/', 1)[0]
    thumbnail_s3_key = f'{base_path}/thumbnails/{name_without_ext}.jpg'
    
    # Load video
    print(f"Loading video from {file_path}")
    video_clip = VideoFileClip(file_path)
    
    # Get thumbnail - avoid black screen by trying multiple frames
    thumbnail_generated = False
    for i in range(0, min(int(video_clip.duration), 10)):
        try:
            # Get frame and store on local disk
            video_clip.save_frame(thumbnail_local_path, t=i)
            
            # Upload to S3
            s3.upload_file(thumbnail_local_path, s3_bucket, thumbnail_s3_key)
            
            print(f"Thumbnail generated at t={i}s and uploaded to s3://{s3_bucket}/{thumbnail_s3_key}")
            thumbnail_generated = True
            break
        except Exception as ex:
            print(f"Failed to generate thumbnail at t={i}s: {ex}")
            continue
    
    if not thumbnail_generated:
        # Fallback to first frame
        video_clip.save_frame(thumbnail_local_path, t=0)
        s3.upload_file(thumbnail_local_path, s3_bucket, thumbnail_s3_key)
        print(f"Fallback thumbnail uploaded to s3://{s3_bucket}/{thumbnail_s3_key}")
    
    # Construct metadata
    metadata = {
        'Size': os.path.getsize(file_path),
        'Resolution': list(video_clip.size),  # [width, height]
        'Duration': float(video_clip.duration),
        'Fps': float(video_clip.fps),
        'NameFormat': file_path.split('.')[-1],
        'ThumbnailS3Bucket': s3_bucket,
        'ThumbnailS3Key': thumbnail_s3_key,
    }
    
    video_clip.close()
    
    return metadata
