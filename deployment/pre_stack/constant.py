# Pre stack
S3_BUCKET_DATA_PREFIX='bedrock-video-eval'
COGNITO_NAME_PREFIX='bedrock-video-eval'
LAMBDA_NAME_PREFIX='bedrock-video-eval-'
COGNITO_NAME_PREFIX='bedrock-video-eval'

S3_VECTOR_BUCKET_NAME='bedrock-video-eval-vector-bucket'
S3_VECTOR_INDEX_NAME='bedrock-nova-mme-video-clip-1024'
S3_VECTOR_INDEX_NOVA_MME_FIXED = "bedrock-nova-mme-video-async-1024"
S3_VECTOR_INDEX_TLABS_27 = 'bedrock-tlabs-video-1024'
S3_VECTOR_INDEX_TLABS_30 = 'bedrock-tlabs-video-512'
EMBEDDING_DIM_DEFAULT_NOVA_MME = '1024'
EMBEDDING_DIM_DEFAULT_27='1024'
EMBEDDING_DIM_DEFAULT_30='512'

LAMBDA_LAYER_SOURCE_S3_KEY_MOVIEPY="layer/moviepy_layer.zip"
LAMBDA_LAYER_SOURCE_S3_KEY_OPENCV="layer/opencv_layer.zip"
LAMBDA_LAYER_SOURCE_S3_KEY_BOTO3="layer/boto3_layer.zip"
LAMBDA_LAYER_SOURCE_S3_KEY_GOOGLE="layer/google_layer.zip"
LAMBDA_LAYER_SOURCE_S3_KEY_STRANDS_AGENTS="layer/strands_agents_layer.zip"