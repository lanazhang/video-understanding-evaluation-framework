S3_BUCKET_DATA_PREFIX='bedrock-video-eval'
COGNITO_NAME_PREFIX='bedrock-video-eval'
API_NAME_PREFIX='bedrock-video-eval-api'
DYNAMODB_TABLE_PREFIX='bedrock_video_eval_'
LAMBDA_NAME_PREFIX='bedrock-video-'
STEP_FUNCTIONS_NAME_PREFIX='bedrock-video-eval-'
SM_NOTEBOOK_INSTANCE_NAME_PREFIX='bedrock-video-eval-'

S3_VECTOR_BUCKET_NAME='bedrock-video-eval-vector-bucket'
S3_VECTOR_INDEX_NAME='bedrock-nova-mme-video-clip-1024'
S3_VECTOR_INDEX_NOVA_MME_FIXED = "bedrock-nova-mme-video-async-1024"
EMBEDDING_DIM_DEFAULT='1024'

LAMBDA_LAYER_SOURCE_S3_KEY_SCENE_DETECT="layer/scenedetect_layer.zip"
LAMBDA_LAYER_SOURCE_S3_KEY_MOVIEPY="layer/moviepy_layer.zip"
LAMBDA_LAYER_SOURCE_S3_KEY_OPENCV="layer/opencv_layer.zip"
LAMBDA_LAYER_SOURCE_S3_KEY_BOTO3="layer/boto3_layer.zip"

DYNAMO_VIDEO_TABLE="bedrock_video_eval_video"
DYNAMO_VIDEO_ANALYZE_TABLE="bedrock_video_eval_analyze_table"

DYNAMO_VIDEO_FRAME_TABLE="video_eval_extr_srv_video_frame"
DYNAMO_VIDEO_SHOT_TABLE="video_eval_extr_srv_video_shot"
DYNAMO_VIDEO_USAGE_TABLE="video_eval_usage"

VIDEO_UPLOAD_S3_PREFIX='upload'
VIDEO_SAMPLE_CHUNK_DURATION_S="600"
VIDEO_SAMPLE_S3_PREFIX="video_frame_"
VIDEO_FRAME_SIMILAIRTY_THRESHOLD_DEFAULT_MME='0.2'
VIDEO_FRAME_SIMILAIRTY_THRESHOLD_DEFAULT_ORB='0.325'
TRANSCRIBE_JOB_PREFIX='video_analysis_'
TRANSCRIBE_OUTPUT_PREFIX='transcribe'

MODEL_ID_video_evalE='amazon.nova-2-multimodal-embeddings-v1:0'
MODEL_ID_IMAGE_UNDERSTANDING="amazon.nova-lite-v1:0"

STEP_FUNCTIONS_FRAME_BASED_FLOW_TIMEOUT_HR="3"
STEP_FUNCTIONS_CLIP_BASED_FLOW_TIMEOUT_HR="3"

S3_PRESIGNED_URL_EXPIRY_S="3600"