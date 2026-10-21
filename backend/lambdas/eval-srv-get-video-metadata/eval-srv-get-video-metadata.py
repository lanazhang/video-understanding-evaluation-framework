"""
Lambda function to extract video metadata and generate thumbnails.

Dependencies (provided by Lambda layers):
- moviepy (from moviepy_layer): includes Pillow/PIL
- boto3 (AWS SDK)
"""

import json
import boto3
import os
import time
from moviepy import VideoFileClip
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')
bedrock = boto3.client('bedrock-runtime')

table_name = os.environ.get('DYNAMO_VIDEO_TABLE')
MODEL_ID_IMAGE_UNDERSTANDING = os.environ.get('MODEL_ID_IMAGE_UNDERSTANDING')
# 'model' (default): ask a Bedrock model whether a frame is a usable thumbnail.
# 'local': pixel-statistics check, no model call (used by the local runtime).
THUMBNAIL_CHECK = os.environ.get('THUMBNAIL_CHECK', 'model')
DYNAMO_VIDEO_USAGE_TABLE = os.environ.get('DYNAMO_VIDEO_USAGE_TABLE')

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

def bedrock_converse(config, max_retries=3, retry_delay=1, image_s3_bucket=None, image_s3_key=None):
    """Call Bedrock Converse API with image analysis"""
    inference_config = config.get("inferConfig")
    if not inference_config:
        inference_config = {"maxTokens": 500, "topP": 0.1, "temperature": 0.3}

    retries = 0
    while retries < max_retries:
        try:
            # Construct the message with text and image content
            messages = [
                {
                    "role": "user",
                    "content": [
                        {
                            "text": config["prompt"]
                        },
                    ]
                }
            ]

            if image_s3_bucket and image_s3_key:
                img_format = image_s3_key.split('.')[-1].lower()
                if img_format == 'jpg':
                    img_format = 'jpeg'
                file_obj = s3.get_object(Bucket=image_s3_bucket, Key=image_s3_key)
                image_content = file_obj['Body'].read()
                messages[0]["content"].append({
                    "image": {
                        "format": img_format,
                        "source": {
                            "bytes": image_content
                        },
                    }
                })

            # Call Bedrock Converse
            if config.get("toolConfig"):
                response = bedrock.converse(
                    modelId=config["modelId"],
                    messages=messages,
                    inferenceConfig=inference_config,
                    toolConfig=config["toolConfig"]
                )
            else:
                response = bedrock.converse(
                    modelId=config["modelId"],
                    messages=messages,
                    inferenceConfig=inference_config,
                )
            
            if response["ResponseMetadata"]["HTTPStatusCode"] != 200:
                raise Exception(f"API request failed: {response['ResponseMetadata']['HTTPStatusCode']}")

            return response
        except Exception as ex:
            print(f"Bedrock converse error: {ex}")
            retries += 1
            if retries < max_retries:
                time.sleep(retry_delay)

    return None

def parse_converse_response(response):
    """Parse Bedrock Converse API response"""
    if not response:
        return None

    tool_use, txt_result = None, None
    contents = response.get("output", {}).get("message", {}).get("content", [])
    for c in contents:
        if "toolUse" in c:
            tool_use = c["toolUse"].get("input")
        elif "text" in c:
            txt_result = c["text"]

    if tool_use:
        return tool_use
    elif txt_result:
        return txt_result
    elif "content" in response:
        return response["content"]
    return response

def update_usage_to_db(video_id, index, name, model_id, input_tokens, output_tokens, total_tokens):
    """Store token usage to DynamoDB"""
    if not DYNAMO_VIDEO_USAGE_TABLE:
        return None
        
    try:
        usage_table = dynamodb.Table(DYNAMO_VIDEO_USAGE_TABLE)
        usage = {
            "id": f"{video_id}_{index}_{name}_thumbnail",
            "index": index,
            "type": "image_understanding",
            "name": name,
            "task_id": video_id,
            "model_id": model_id,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": total_tokens
        }
        usage_table.put_item(Item=usage)
        return usage
    except Exception as ex:
        print(f"Error updating usage: {ex}")
        return None

def is_blank_frame_local(image_path, min_stddev=6.0):
    """True if the frame is (nearly) a single flat colour, judged by grayscale standard deviation."""
    from PIL import Image, ImageStat
    with Image.open(image_path) as img:
        return ImageStat.Stat(img.convert('L')).stddev[0] < min_stddev

def is_solid_color_frame(video_id, index, thumbnail_s3_bucket, thumbnail_s3_key):
    """
    Check if an image is suitable as a video thumbnail using Nova Lite.
    Returns True if the frame is NOT suitable (solid/blank screen).
    """
    config = {
        "name": "Thumbnail verification",
        "modelId": MODEL_ID_IMAGE_UNDERSTANDING,
        "prompt": "Analyze the image if suitable to be used as a video thumbnail.",
        "toolConfig": {
            "tools": [
                {
                    "toolSpec": {
                        "name": "tool_result",
                        "description": "Analyze the image and determine if it is suitable as a video thumbnail: it should not be a solid or blank screen, must have sufficient contrast and clarity.",
                        "inputSchema": {
                            "json": {
                                "type": "object",
                                "properties": {
                                    "result": {
                                        "type": "boolean",
                                        "description": "If suitable to be used as a video thumbnail."
                                    }
                                },
                                "required": [
                                    "result"
                                ]
                            }
                        }
                    }
                }
            ]
        },
        "inferConfig": {
            "maxTokens": 500,
            "topP": 0.1,
            "temperature": 0.7
        }
    }
    
    try:
        response = bedrock_converse(config=config, image_s3_bucket=thumbnail_s3_bucket, image_s3_key=thumbnail_s3_key)
        output = parse_converse_response(response)

        # Parse usage
        if response and "usage" in response:
            input_tokens = response["usage"]["inputTokens"]
            output_tokens = response["usage"]["outputTokens"]
            total_tokens = response["usage"]["totalTokens"]

            # Store to the usage table
            update_usage_to_db(video_id, index, "thumbnail", MODEL_ID_IMAGE_UNDERSTANDING, input_tokens, output_tokens, total_tokens)

        # Return True if NOT suitable (solid color), False if suitable
        return output is None or output.get("result") != True
    except Exception as ex:
        print(f"Error checking frame with Nova Lite: {ex}")
        # If we can't check, assume it's not solid color (return False)
        return False

def get_video_metadata(s3_bucket, s3_key_video, file_path):
    """
    Extract video metadata and generate thumbnail
    """
    video_id = s3_key_video.split('/')[-2] if '/' in s3_key_video else 'unknown'
    video_filename = s3_key_video.split('/')[-1]
    name_without_ext = video_filename.rsplit('.', 1)[0]
    
    # Thumbnail paths
    thumbnail_local_path = f'{local_path}thumbnail.jpeg'
    base_path = s3_key_video.rsplit('/', 1)[0]
    thumbnail_s3_key = f'{base_path}/thumbnails/{name_without_ext}.jpg'
    
    # Load video
    print(f"Loading video from {file_path}")
    video_clip = VideoFileClip(file_path)
    
    # Get thumbnail - avoid solid color frames using Nova Lite
    thumbnail_generated = False
    max_attempts = min(int(video_clip.duration), 10)  # Try up to 10 frames
    
    # Try frames at different intervals to find a good thumbnail
    for i in range(0, max_attempts):
        try:
            # Sample at different points: start, 25%, 50%, 75%, etc.
            if i == 0:
                t = 1  # Skip first second (often black)
            elif i < 4:
                t = int(video_clip.duration * (i / 4))  # 25%, 50%, 75%
            else:
                t = i  # Then try sequential seconds
            
            # Ensure we don't exceed video duration
            if t >= video_clip.duration:
                continue
            
            # Get frame and store on local disk
            video_clip.save_frame(thumbnail_local_path, t=t)
            
            if THUMBNAIL_CHECK == 'local':
                if is_blank_frame_local(thumbnail_local_path):
                    print(f"Skipping blank frame at t={t}s")
                    continue
                s3.upload_file(thumbnail_local_path, s3_bucket, thumbnail_s3_key)
                print(f"Good thumbnail generated at t={t}s and uploaded to s3://{s3_bucket}/{thumbnail_s3_key}")
                thumbnail_generated = True
                break

            # Upload to S3 temporarily for Nova Lite analysis
            temp_s3_key = f'{base_path}/temp_thumbnail_{i}.jpg'
            s3.upload_file(thumbnail_local_path, s3_bucket, temp_s3_key)
            
            # Check if frame is solid color using Nova Lite
            if is_solid_color_frame(video_id, i, s3_bucket, temp_s3_key):
                print(f"Skipping unsuitable frame at t={t}s")
                # Delete temp file
                try:
                    s3.delete_object(Bucket=s3_bucket, Key=temp_s3_key)
                except:
                    pass
                continue
            
            # Good frame found - move to final location
            s3.copy_object(
                Bucket=s3_bucket,
                CopySource={'Bucket': s3_bucket, 'Key': temp_s3_key},
                Key=thumbnail_s3_key
            )
            s3.delete_object(Bucket=s3_bucket, Key=temp_s3_key)
            
            print(f"Good thumbnail generated at t={t}s and uploaded to s3://{s3_bucket}/{thumbnail_s3_key}")
            thumbnail_generated = True
            break
        except Exception as ex:
            print(f"Failed to generate thumbnail at t={t}s: {ex}")
            continue
    
    if not thumbnail_generated:
        # Fallback to middle frame (most likely to have content)
        fallback_time = video_clip.duration / 2
        video_clip.save_frame(thumbnail_local_path, t=fallback_time)
        s3.upload_file(thumbnail_local_path, s3_bucket, thumbnail_s3_key)
        print(f"Fallback thumbnail (t={fallback_time:.1f}s) uploaded to s3://{s3_bucket}/{thumbnail_s3_key}")
    
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
