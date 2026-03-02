from aws_cdk import (
    NestedStack,
    Size,
    aws_ec2 as ec2,
    aws_cognito as _cognito,
    aws_s3 as _s3,
    aws_lambda as _lambda,
    aws_apigateway as _apigw,
    aws_iam as _iam,
    aws_dynamodb as _dynamodb,
    Duration,
    aws_stepfunctions as _aws_stepfunctions,
    RemovalPolicy,
    custom_resources as cr,
    aws_logs as logs,
    aws_events as events,
    aws_events_targets as targets,
)
from aws_cdk.aws_apigateway import IdentitySource
import os

from constructs import Construct
import os, re
from eval_service.constant import *

class EvalServiceStack(NestedStack):
    account_id = None
    region = None
    api_gw_base_url = None
    cognito_user_pool_id = None
    cognito_app_client_id = None
    s3_bucket_name_eval = None

    s3_eval_bucket = None

    moviepy_layer = None
    opencv_layer = None
    aws_layer = None

    cognito_authorizer = None

    api = None
    
    def __init__(self, scope: Construct, construct_id: str, 
                 s3_bucket_name_eval: str, cognito_user_pool_id: str, cognito_app_client_id: str, 
                 **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)
        
        self.account_id=os.environ.get("CDK_DEFAULT_ACCOUNT")
        self.region=os.environ.get("CDK_DEFAULT_REGION")
        
        self.s3_bucket_name_eval = s3_bucket_name_eval
        self.cognito_user_pool_id = cognito_user_pool_id
        self.cognito_app_client_id = cognito_app_client_id

        # Only deploy Cognito and API Gateway for S3 presigned URL management
        self.deploy_dynamodb()
        self.deploy_lambda_layer()
        self.deploy_s3_listener()
        self.deploy_cognito()
        self.deploy_apigw()

    def deploy_dynamodb(self):
        # Create DynamoDB tables
        # Video task table                           
        video_table = _dynamodb.Table(self, 
            id='video-table', 
            table_name=DYNAMO_VIDEO_TABLE, 
            partition_key=_dynamodb.Attribute(name='Id', type=_dynamodb.AttributeType.STRING),
            point_in_time_recovery=True,
            removal_policy=RemovalPolicy.DESTROY
        )
        video_table.add_global_secondary_index(
            index_name="RequestBy-index",
            partition_key=_dynamodb.Attribute(
                name="RequestBy",
                type=_dynamodb.AttributeType.STRING
            ),
            projection_type=_dynamodb.ProjectionType.ALL 
        )

        # Video analyze table (video_task)
        video_analyze_table = _dynamodb.Table(self,
            id='video-analyze-table',
            table_name=DYNAMO_VIDEO_ANALYZE_TABLE,
            partition_key=_dynamodb.Attribute(name='Id', type=_dynamodb.AttributeType.STRING),
            sort_key=_dynamodb.Attribute(name='Type', type=_dynamodb.AttributeType.STRING),
            point_in_time_recovery=True,
            removal_policy=RemovalPolicy.DESTROY
        )
        video_analyze_table.add_global_secondary_index(
            index_name="VideoId-index",
            partition_key=_dynamodb.Attribute(
                name="VideoId",
                type=_dynamodb.AttributeType.STRING
            ),
            projection_type=_dynamodb.ProjectionType.ALL
        )

        # Ground truth table
        ground_truth_table = _dynamodb.Table(self,
            id='ground-truth-table',
            table_name=DYNAMO_GROUND_TRUTH_TABLE,
            partition_key=_dynamodb.Attribute(name='Id', type=_dynamodb.AttributeType.STRING),
            point_in_time_recovery=True,
            removal_policy=RemovalPolicy.DESTROY
        )
        ground_truth_table.add_global_secondary_index(
            index_name="VideoId-index",
            partition_key=_dynamodb.Attribute(
                name="VideoId",
                type=_dynamodb.AttributeType.STRING
            ),
            projection_type=_dynamodb.ProjectionType.ALL
        )

        # Evaluation task table
        evaluation_task_table = _dynamodb.Table(self,
            id='evaluation-task-table',
            table_name=DYNAMO_EVALUATION_TASK_TABLE,
            partition_key=_dynamodb.Attribute(name='Id', type=_dynamodb.AttributeType.STRING),
            point_in_time_recovery=True,
            removal_policy=RemovalPolicy.DESTROY
        )
        evaluation_task_table.add_global_secondary_index(
            index_name="GroundTruthId-index",
            partition_key=_dynamodb.Attribute(
                name="GroundTruthId",
                type=_dynamodb.AttributeType.STRING
            ),
            projection_type=_dynamodb.ProjectionType.ALL
        )
        evaluation_task_table.add_global_secondary_index(
            index_name="VideoId-index",
            partition_key=_dynamodb.Attribute(
                name="VideoId",
                type=_dynamodb.AttributeType.STRING
            ),
            projection_type=_dynamodb.ProjectionType.ALL
        )

    def deploy_cognito(self):
        user_pool = _cognito.UserPool.from_user_pool_id(
            self, "WebUserPool",
            user_pool_id=self.cognito_user_pool_id
        )

        #self.cognito_user_pool_id = user_pool.user_pool_id
        web_client = _cognito.UserPoolClient.from_user_pool_client_id(
            self, "NovaMmSrvAppClient",
            user_pool_client_id=self.cognito_app_client_id
        )

        # Create API Gateway CognitioUeserPoolAuthorizer
        self.cognito_authorizer = _apigw.CognitoUserPoolsAuthorizer(self, f"ExtrSrvWebAuth", 
            cognito_user_pools=[user_pool],
            identity_source=IdentitySource.header('Authorization')
        )

    def deploy_lambda_layer(self):
        # Create Lambda Layers which will be used by Lambda deployment
        layer_bucket = _s3.Bucket.from_bucket_name(self, "LayerBucket", bucket_name=self.s3_bucket_name_eval)
        self.moviepy_layer = _lambda.LayerVersion(self, 'MoviePyLayer',
            code=_lambda.S3Code(bucket=layer_bucket, key=LAMBDA_LAYER_SOURCE_S3_KEY_MOVIEPY),
            compatible_runtimes=[_lambda.Runtime.PYTHON_3_13],
            description="python3.13 moviepy 2.2.1"
        )
        self.opencv_layer = _lambda.LayerVersion(self, 'OpenCvPyLayer',
            code=_lambda.S3Code(bucket=layer_bucket, key=LAMBDA_LAYER_SOURCE_S3_KEY_OPENCV),
            compatible_runtimes=[_lambda.Runtime.PYTHON_3_13],
            description="python3.13 opencv-python-headless 4.12.0.88"
        )
        self.boto3_layer = _lambda.LayerVersion(self, 'Boto3PyLayer',
            code=_lambda.S3Code(bucket=layer_bucket, key=LAMBDA_LAYER_SOURCE_S3_KEY_BOTO3),
            compatible_runtimes=[_lambda.Runtime.PYTHON_3_13],
            description="python3.13 boto3 for S3 vectors"
        )
        self.google_layer = _lambda.LayerVersion(self, 'GoogleLayer',
            code=_lambda.S3Code(bucket=layer_bucket, key=LAMBDA_LAYER_SOURCE_S3_KEY_GOOGLE),
            compatible_runtimes=[_lambda.Runtime.PYTHON_3_13],
            description="python3.13 google-generativeai 3.0.0"
        )
        self.strands_agents_layer = _lambda.LayerVersion(self, 'StrandsAgentsLayer',
            code=_lambda.S3Code(bucket=layer_bucket, key=LAMBDA_LAYER_SOURCE_S3_KEY_STRANDS_AGENTS),
            compatible_runtimes=[_lambda.Runtime.PYTHON_3_13],
            description="python3.13 strands-agents 1.28.0, strands-agents-tools 0.2.21"
        )
        self.aws_layer = _lambda.LayerVersion.from_layer_version_arn(self, "AwsLayerPowerTool", 
            layer_version_arn=f"arn:aws:lambda:{self.region}:336392948345:layer:AWSSDKPandas-Python313:4"
        )

    def deploy_s3_listener(self):
        # Get reference to the S3 bucket
        s3_eval_bucket = _s3.Bucket.from_bucket_name(self, "EvalBucket", bucket_name=self.s3_bucket_name_eval)
        
        # Create S3 listener Lambda role
        lambda_key = "eval-srv-s3-listener"
        lambda_s3_listener_role = _iam.Role(
            self, "EvalSrvLambdaS3ListenerRole",
            assumed_by=_iam.ServicePrincipal("lambda.amazonaws.com"),
            inline_policies={f"{lambda_key}-policy": _iam.PolicyDocument(
                statements=[
                    _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["s3:ListBucket","s3:GetObject","s3:PutObject","s3:DeleteObject","s3:ListMultipartUploadParts","s3:ListBucketMultipartUploads"],
                        resources=[f"arn:aws:s3:::{self.s3_bucket_name_eval}",f"arn:aws:s3:::{self.s3_bucket_name_eval}/*"]
                    ),
                    _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=[
                            "s3vectors:CreateIndex",
                            "s3vectors:DeleteIndex",
                            "s3vectors:DescribeIndex",
                            "s3vectors:ListIndexes",
                            "s3vectors:PutVectors",
                            "s3vectors:GetVectors",
                            "s3vectors:DeleteVectors",
                            "s3vectors:QueryVectors"
                        ],
                        resources=[
                            f"arn:aws:s3vectors:{self.region}:{self.account_id}:bucket/{S3_VECTOR_BUCKET_NAME}",
                            f"arn:aws:s3vectors:{self.region}:{self.account_id}:bucket/{S3_VECTOR_BUCKET_NAME}*"
                        ]
                    ),
                    _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["logs:CreateLogGroup"],
                        resources=[f"arn:aws:logs:{self.region}:{self.account_id}:*"]
                    ),
                    _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["logs:CreateLogStream", "logs:PutLogEvents"],
                        resources=[f"arn:aws:logs:{self.region}:{self.account_id}:log-group:/aws/lambda/{LAMBDA_NAME_PREFIX}{lambda_key}:*"]
                    ),
                    _iam.PolicyStatement(
                        actions=["dynamodb:DeleteItem","dynamodb:Query", "dynamodb:Scan", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:GetItem"],
                        resources=[
                            f"arn:aws:dynamodb:{self.region}:{self.account_id}:table/{DYNAMO_VIDEO_TABLE}/index/*",
                            f"arn:aws:dynamodb:{self.region}:{self.account_id}:table/{DYNAMO_VIDEO_TABLE}",
                            f"arn:aws:dynamodb:{self.region}:{self.account_id}:table/{DYNAMO_VIDEO_ANALYZE_TABLE}/index/*",
                            f"arn:aws:dynamodb:{self.region}:{self.account_id}:table/{DYNAMO_VIDEO_ANALYZE_TABLE}",
                            f"arn:aws:dynamodb:{self.region}:{self.account_id}:table/{DYNAMO_VIDEO_USAGE_TABLE}/index/*",
                            f"arn:aws:dynamodb:{self.region}:{self.account_id}:table/{DYNAMO_VIDEO_USAGE_TABLE}",
                        ]
                    ),
                    _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["bedrock:InvokeModel"],
                        resources=[
                            "arn:aws:bedrock:*:*:foundation-model/*",
                            "arn:aws:bedrock:*:*:inference-profile/*"
                        ]
                    )
                ]
            )}
        )
        
        # Create S3 listener Lambda function
        lambda_s3_listener = _lambda.Function(
            self, 
            id='eval_srv_s3_listener_function', 
            function_name=f"{LAMBDA_NAME_PREFIX}{lambda_key}", 
            runtime=_lambda.Runtime.PYTHON_3_13,
            handler=f'{lambda_key}.lambda_handler',
            code=_lambda.Code.from_asset(os.path.join("../source/", f"eval_service/lambda/{lambda_key}")),
            timeout=Duration.seconds(180),
            role=lambda_s3_listener_role,
            memory_size=10240,
            layers=[self.boto3_layer],
            environment={
                'DYNAMO_VIDEO_TABLE': DYNAMO_VIDEO_TABLE,
                'DYNAMO_VIDEO_ANALYZE_TABLE': DYNAMO_VIDEO_ANALYZE_TABLE,
                'S3_VECTOR_BUCKET': S3_VECTOR_BUCKET_NAME,
                'S3_VECTOR_INDEX': S3_VECTOR_INDEX_NAME,
                'DYNAMO_VIDEO_USAGE_TABLE': DYNAMO_VIDEO_USAGE_TABLE,
                'MODEL_ID_BEDROCK_MME': MODEL_ID_video_evalE,
            },
        )
        
        # Grant S3 access to trigger the Lambda function
        s3_eval_bucket.grant_read(lambda_s3_listener)
        
        # Create EventBridge rule for S3 events
        s3_event_rule = events.Rule(
            self, "S3ObjectCreatedRule",
            description="Trigger Lambda when .jsonl files are created in tasks/ prefix",
            event_pattern=events.EventPattern(
                source=["aws.s3"],
                detail_type=["Object Created"],
                detail={
                    "bucket": {"name": [self.s3_bucket_name_eval]},
                    "object": {"key": [{"wildcard": "tasks/*/video-analyze/nova-mme/*/*.jsonl"}]}
                }
            )
        )
        
        # Add Lambda as target for the EventBridge rule
        s3_event_rule.add_target(targets.LambdaFunction(lambda_s3_listener))
        
        # Grant EventBridge permission to invoke the Lambda
        lambda_s3_listener.add_permission(
            "AllowEventBridgeInvoke",
            principal=_iam.ServicePrincipal("events.amazonaws.com"),
            source_arn=s3_event_rule.rule_arn
        )
        
        # Create TwelveLabs S3 listener Lambda role
        lambda_key = "eval-srv-s3-listener-tlabs"
        lambda_s3_listener_tlabs_role = _iam.Role(
            self, "EvalSrvLambdaS3ListenerTlabsRole",
            assumed_by=_iam.ServicePrincipal("lambda.amazonaws.com"),
            inline_policies={f"{lambda_key}-policy": _iam.PolicyDocument(
                statements=[
                    _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["s3:ListBucket","s3:GetObject","s3:PutObject","s3:DeleteObject","s3:ListMultipartUploadParts","s3:ListBucketMultipartUploads"],
                        resources=[f"arn:aws:s3:::{self.s3_bucket_name_eval}",f"arn:aws:s3:::{self.s3_bucket_name_eval}/*"]
                    ),
                    _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=[
                            "s3vectors:CreateIndex",
                            "s3vectors:DeleteIndex",
                            "s3vectors:DescribeIndex",
                            "s3vectors:ListIndexes",
                            "s3vectors:PutVectors",
                            "s3vectors:GetVectors",
                            "s3vectors:DeleteVectors",
                            "s3vectors:QueryVectors"
                        ],
                        resources=[
                            f"arn:aws:s3vectors:{self.region}:{self.account_id}:bucket/{S3_VECTOR_BUCKET_NAME}",
                            f"arn:aws:s3vectors:{self.region}:{self.account_id}:bucket/{S3_VECTOR_BUCKET_NAME}*"
                        ]
                    ),
                    _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["logs:CreateLogGroup"],
                        resources=[f"arn:aws:logs:{self.region}:{self.account_id}:*"]
                    ),
                    _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["logs:CreateLogStream", "logs:PutLogEvents"],
                        resources=[f"arn:aws:logs:{self.region}:{self.account_id}:log-group:/aws/lambda/{LAMBDA_NAME_PREFIX}{lambda_key}:*"]
                    ),
                    _iam.PolicyStatement(
                        actions=["dynamodb:DeleteItem","dynamodb:Query", "dynamodb:Scan", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:GetItem"],
                        resources=[
                            f"arn:aws:dynamodb:{self.region}:{self.account_id}:table/{DYNAMO_VIDEO_TABLE}/index/*",
                            f"arn:aws:dynamodb:{self.region}:{self.account_id}:table/{DYNAMO_VIDEO_TABLE}",
                            f"arn:aws:dynamodb:{self.region}:{self.account_id}:table/{DYNAMO_VIDEO_ANALYZE_TABLE}/index/*",
                            f"arn:aws:dynamodb:{self.region}:{self.account_id}:table/{DYNAMO_VIDEO_ANALYZE_TABLE}",
                        ]
                    )
                ]
            )}
        )
        
        # Create TwelveLabs S3 listener Lambda function
        lambda_s3_listener_tlabs = _lambda.Function(
            self, 
            id='eval_srv_s3_listener_tlabs_function', 
            function_name=f"{LAMBDA_NAME_PREFIX}{lambda_key}", 
            runtime=_lambda.Runtime.PYTHON_3_13,
            handler=f'{lambda_key}.lambda_handler',
            code=_lambda.Code.from_asset(os.path.join("../source/", f"eval_service/lambda/{lambda_key}")),
            timeout=Duration.seconds(180),
            role=lambda_s3_listener_tlabs_role,
            memory_size=10240,
            layers=[self.boto3_layer],
            environment={
                'DYNAMO_VIDEO_ANALYZE_TABLE': DYNAMO_VIDEO_ANALYZE_TABLE,
                'TLABS_S3_VECTOR_BUCKET': S3_VECTOR_BUCKET_NAME,
                'TLABS_S3_VECTOR_INDEX': 'tlabs-mme-27',
                'TLABS_S3_VECTOR_INDEX_30': 'tlabs-mme-30',
            },
        )
        
        # Grant S3 access to trigger the Lambda function
        s3_eval_bucket.grant_read(lambda_s3_listener_tlabs)
        
        # Create EventBridge rule for TwelveLabs S3 events
        s3_event_rule_tlabs = events.Rule(
            self, "S3ObjectCreatedRuleTlabs",
            description="Trigger Lambda when TwelveLabs output.json files are created",
            event_pattern=events.EventPattern(
                source=["aws.s3"],
                detail_type=["Object Created"],
                detail={
                    "bucket": {"name": [self.s3_bucket_name_eval]},
                    "object": {"key": [{"wildcard": "tasks/*/video-analyze/tlabs/*/output.json"}]}
                }
            )
        )
        
        # Add Lambda as target for the EventBridge rule
        s3_event_rule_tlabs.add_target(targets.LambdaFunction(lambda_s3_listener_tlabs))
        
        # Grant EventBridge permission to invoke the Lambda
        lambda_s3_listener_tlabs.add_permission(
            "AllowEventBridgeInvokeTlabs",
            principal=_iam.ServicePrincipal("events.amazonaws.com"),
            source_arn=s3_event_rule_tlabs.rule_arn
        )

    def deploy_step_function(self):
        # Step Function - start
        # Lambda: eval-srv-wf-frame-video-metadata
        lambda_key = "eval-srv-wf-frame-video-metadata"
        lambda_extration_srv_metadata_role = self.create_role(lambda_key, ["s3","dynamodb","bedrock"])
        lambda_eval_srv_fw_frame_metadata = self.create_lambda(
            lambda_key, 
            lambda_extration_srv_metadata_role, 
            {
                'DYNAMO_video_table': DYNAMO_video_table,
                'DYNAMO_VIDEO_FRAME_TABLE': DYNAMO_VIDEO_FRAME_TABLE,
                'MODEL_ID_IMAGE_UNDERSTANDING': MODEL_ID_IMAGE_UNDERSTANDING,
                'VIDEO_SAMPLE_CHUNK_DURATION_S': VIDEO_SAMPLE_CHUNK_DURATION_S,
                'VIDEO_SAMPLE_S3_PREFIX': VIDEO_SAMPLE_S3_PREFIX,
                'VIDEO_SAMPLE_S3_BUCKET': self.s3_bucket_name_eval,
                'DYNAMO_VIDEO_USAGE_TABLE': DYNAMO_VIDEO_USAGE_TABLE
            }, 
            timeout_s=15*60, memory_size=10240, ephemeral_storage_size=10240,
            layers=[self.moviepy_layer]
        )

        # Lambda: eval-srv-wf-frame-sample-video
        lambda_key = "eval-srv-wf-frame-sample-video"
        lambda_extration_srv_wf_frame_sample_video_role = self.create_role(lambda_key, ["s3","dynamodb","bedrock"])
        lambda_eval_srv_fw_frame_sample_video = self.create_lambda(
            lambda_key, 
            lambda_extration_srv_wf_frame_sample_video_role, 
            {
                'DYNAMO_video_table': DYNAMO_video_table,
                'DYNAMO_VIDEO_FRAME_TABLE': DYNAMO_VIDEO_FRAME_TABLE,
                'VIDEO_SAMPLE_CHUNK_DURATION_S': VIDEO_SAMPLE_CHUNK_DURATION_S,
                'VIDEO_SAMPLE_S3_PREFIX': VIDEO_SAMPLE_S3_PREFIX,
                'VIDEO_SAMPLE_S3_BUCKET': self.s3_bucket_name_eval,
            }, 
            timeout_s=15*60, memory_size=10240, ephemeral_storage_size=10240,
            layers=[self.moviepy_layer]
        )

        # Lambda: eval-srv-fw-frame-sample-dedup-mme
        lambda_key = "eval-srv-fw-frame-sample-dedup-mme"
        lambda_extration_srv_fw_frame_dedup_mme_role = self.create_role(lambda_key, ["s3","dynamodb","bedrock"])
        lambda_eval_srv_wf_frame_sample_dedup_mme = self.create_lambda(
            lambda_key, 
            lambda_extration_srv_fw_frame_dedup_mme_role, 
            {
                'DYNAMO_VIDEO_FRAME_TABLE': DYNAMO_VIDEO_FRAME_TABLE,
                'DYNAMO_video_table': DYNAMO_video_table,
                'VIDEO_FRAME_SIMILAIRTY_THRESHOLD': VIDEO_FRAME_SIMILAIRTY_THRESHOLD_DEFAULT_MME,
                'VIDEO_SAMPLE_S3_PREFIX': VIDEO_SAMPLE_S3_PREFIX,
                'BEDROCK_MME_MODEL_ID': MODEL_ID_BEDROCK_MME,
                'DYNAMO_VIDEO_USAGE_TABLE': DYNAMO_VIDEO_USAGE_TABLE
            }, 
            timeout_s=300, memory_size=10240, ephemeral_storage_size=1024,
            layers=[self.aws_layer],
        )

        # Lambda: eval-srv-fw-frame-sample-dedup-orb
        lambda_key = "eval-srv-fw-frame-sample-dedup-orb"
        lambda_extration_srv_fw_frame_dedup_orb_role = self.create_role(lambda_key, ["s3","dynamodb"])
        lambda_eval_srv_wf_frame_sample_dedup_orb = self.create_lambda(
            lambda_key, 
            lambda_extration_srv_fw_frame_dedup_orb_role, 
            {
                'DYNAMO_VIDEO_FRAME_TABLE': DYNAMO_VIDEO_FRAME_TABLE,
                'DYNAMO_video_table': DYNAMO_video_table,
                'VIDEO_FRAME_SIMILAIRTY_THRESHOLD_DEFAULT': VIDEO_FRAME_SIMILAIRTY_THRESHOLD_DEFAULT_ORB,
                'VIDEO_SAMPLE_FILE_PREFIX': VIDEO_SAMPLE_S3_PREFIX,
            }, 
            timeout_s=60, memory_size=10240, ephemeral_storage_size=1024,
            layers=[self.opencv_layer],
        )

        # Lambda: eval-srv-wf-frame-extraction
        lambda_key = "eval-srv-wf-frame-extraction" 
        lambda_eval_srv_wf_frame_eval_role = self.create_role(lambda_key, ["s3","dynamodb","bedrock"])
        lambda_eval_srv_wf_frame_eval = self.create_lambda(
            lambda_key, 
            lambda_eval_srv_wf_frame_eval_role, 
            {
                'DYNAMO_VIDEO_FRAME_TABLE': DYNAMO_VIDEO_FRAME_TABLE,
                'DYNAMO_video_table': DYNAMO_video_table,
                'DYNAMO_VIDEO_USAGE_TABLE': DYNAMO_VIDEO_USAGE_TABLE
            }, 
            timeout_s=300, memory_size=1024, ephemeral_storage_size=1024,
            layers=[self.opencv_layer],
        )

        # Lambda: eval-srv-wf-start-transcribe
        lambda_key = "eval-srv-wf-start-transcribe" 
        lambda_eval_srv_wf_start_transcribe_role = self.create_role(lambda_key, ["dynamodb","transcribe","s3"])
        lambda_eval_srv_wf_start_transcribe = self.create_lambda(
            lambda_key, 
            lambda_eval_srv_wf_start_transcribe_role, 
            {
                'DYNAMO_video_table': DYNAMO_video_table,
                'TRANSCRIBE_JOB_PREFIX': TRANSCRIBE_JOB_PREFIX,
                'TRANSCRIBE_OUTPUT_BUCKET': self.s3_bucket_name_eval,
                'TRANSCRIBE_OUTPUT_PREFIX': TRANSCRIBE_OUTPUT_PREFIX
            }, 
            timeout_s=30,
        )

        # Lambda: eval-srv-wf-transcrip-post-process
        lambda_key = "eval-srv-wf-transcrip-post-process" 
        lambda_eval_srv_wf_transcrip_post_process_role = self.create_role(lambda_key, ["s3","dynamodb","transcribe"])
        lambda_eval_srv_wf_transcrip_post_process = self.create_lambda(
            lambda_key, 
            lambda_eval_srv_wf_transcrip_post_process_role, 
            {             
                'DYNAMO_video_table': DYNAMO_video_table,
                'DYNAMO_VIDEO_USAGE_TABLE': DYNAMO_VIDEO_USAGE_TABLE
            }, 
            timeout_s=60*15, memory_size=10240, ephemeral_storage_size=10240,
        )
        
        # Lambda: eval-srv-fw-update-task-status
        lambda_key = "eval-srv-fw-update-task-status"
        lambda_eval_srv_fw_update_task_statu_role = self.create_role(lambda_key, ["dynamodb"])
        lambda_eval_srv_fw_update_task_status = self.create_lambda(
            lambda_key, 
            lambda_eval_srv_fw_update_task_statu_role, 
            {
                'DYNAMO_video_table': DYNAMO_video_table,
            }, 
            timeout_s=10, memory_size=128, ephemeral_storage_size=512,
        )

        # Lambda: eval-srv-wf-clip-video-metadata
        lambda_key = "eval-srv-wf-clip-video-metadata"
        lambda_extration_srv_metadata_role = self.create_role(lambda_key, ["s3","dynamodb","bedrock"])
        lambda_eval_srv_fw_clip_metadata = self.create_lambda(
            lambda_key, 
            lambda_extration_srv_metadata_role, 
            {
                'DYNAMO_video_table': DYNAMO_video_table,
                'MODEL_ID_IMAGE_UNDERSTANDING': MODEL_ID_IMAGE_UNDERSTANDING,
                'VIDEO_SAMPLE_CHUNK_DURATION_S': VIDEO_SAMPLE_CHUNK_DURATION_S,
                'VIDEO_SAMPLE_S3_PREFIX': VIDEO_SAMPLE_S3_PREFIX,
                'VIDEO_SAMPLE_S3_BUCKET': self.s3_bucket_name_eval,
                'DYNAMO_VIDEO_USAGE_TABLE': DYNAMO_VIDEO_USAGE_TABLE,
            }, 
            timeout_s=15*60, memory_size=10240, ephemeral_storage_size=10240,
            layers=[self.moviepy_layer]
        )

        # eval-srv-fw-clip-gen-shot-duration 
        lambda_key = "eval-srv-fw-clip-gen-shot-duration"
        lambda_extration_srv_metadata_role = self.create_role(lambda_key, ["s3","dynamodb","bedrock"])
        lambda_eval_srv_fw_clip_gen_shot_durtion = self.create_lambda(
            lambda_key, 
            lambda_extration_srv_metadata_role, 
            {
                'DYNAMO_VIDEO_SHOT_TABLE': DYNAMO_VIDEO_SHOT_TABLE,
                'MODEL_ID_IMAGE_UNDERSTANDING': MODEL_ID_IMAGE_UNDERSTANDING,
            }, 
            timeout_s=15*60, memory_size=10240, ephemeral_storage_size=10240,
            layers=[self.moviepy_layer],
        )
        
        # eval-srv-wf-clip-gen-shot-video 
        lambda_key = "eval-srv-wf-clip-gen-shot-video"
        lambda_eval_srv_wf_clip_gen_shot_video_role = self.create_role(lambda_key, ["s3","dynamodb"])
        lambda_eval_srv_wf_clip_gen_shot_video = self.create_lambda(
            lambda_key, 
            lambda_eval_srv_wf_clip_gen_shot_video_role, 
            {
                'DYNAMO_video_table': DYNAMO_video_table,
                'DYNAMO_VIDEO_SHOT_TABLE': DYNAMO_VIDEO_SHOT_TABLE,
            }, 
            timeout_s=15*60, memory_size=10240, ephemeral_storage_size=10240,
            layers=[self.moviepy_layer],
        )

        ## eval-srv-wf-clip-shot-understanding
        lambda_key = "eval-srv-wf-clip-shot-understanding"
        lambda_eval_srv_wf_clip_shot_understanding_role = self.create_role(lambda_key, ["s3","dynamodb","bedrock"])
        lambda_eval_srv_fw_clip_shot_understanding = self.create_lambda(
            lambda_key, 
            lambda_eval_srv_wf_clip_shot_understanding_role, 
            {
                'DYNAMO_video_table': DYNAMO_video_table,
                'DYNAMO_VIDEO_SHOT_TABLE': DYNAMO_VIDEO_SHOT_TABLE,
                'S3_BUCKET_DATA': self.s3_bucket_name_eval,
                'DYNAMO_VIDEO_USAGE_TABLE': DYNAMO_VIDEO_USAGE_TABLE,
            }, 
            timeout_s=300, memory_size=4096, ephemeral_storage_size=4096,
            layers=[self.moviepy_layer],
        )

        # eval-srv-wf-clip-shot-embedding 
        lambda_key = "eval-srv-wf-clip-shot-embedding"
        lambda_eval_srv_wf_clip_shot_embed_role = self.create_role(lambda_key, ["s3","dynamodb","bedrock","s3vectors"])
        lambda_eval_srv_wf_clip_shot_embed = self.create_lambda(
            lambda_key, 
            lambda_eval_srv_wf_clip_shot_embed_role, 
            {
                'MME_MODEL_ID': MODEL_ID_BEDROCK_MME,
                'S3_VECTOR_BUCKET': S3_VECTOR_BUCKET_NAME, 
                'S3_VECTOR_INDEX':S3_VECTOR_INDEX_NAME,
                'EMBEDDING_DIM': EMBEDDING_DIM_DEFAULT,
                'DYNAMO_video_table': DYNAMO_video_table,
                'S3_BUCKET_DATA': self.s3_bucket_name_eval,
                'DYNAMO_VIDEO_USAGE_TABLE': DYNAMO_VIDEO_USAGE_TABLE
            }, 
            timeout_s=30, memory_size=10240, ephemeral_storage_size=4096,
            layers=[self.moviepy_layer],
        )

        # StepFunctions 
        sf_key = "eval-srv-frame-based-flow"
        sm_frame_based_flow_json = None
        with open(f'../source/eval_service/stepfunctions/{sf_key}/code.txt', "r") as f:
            sm_frame_based_flow_json = str(f.read())

        if sm_frame_based_flow_json is not None:
            sm_frame_based_flow_json = sm_frame_based_flow_json.replace("##LAMBDA_WF_FRAME_META_DATA##", lambda_eval_srv_fw_frame_metadata.function_arn)
            sm_frame_based_flow_json = sm_frame_based_flow_json.replace("##LAMBDA_WF_FRAME_SAMPLE_VIDEO##", lambda_eval_srv_fw_frame_sample_video.function_arn)
            sm_frame_based_flow_json = sm_frame_based_flow_json.replace("##LAMBDA_WF_FRAME_DEDUP_MME##", lambda_eval_srv_wf_frame_sample_dedup_mme.function_arn)
            sm_frame_based_flow_json = sm_frame_based_flow_json.replace("##LAMBDA_WF_FRAME_DEDUP_ORB##", lambda_eval_srv_wf_frame_sample_dedup_orb.function_arn)
            sm_frame_based_flow_json = sm_frame_based_flow_json.replace("##LAMBDA_WF_FRAME_eval##", lambda_eval_srv_wf_frame_eval.function_arn)
            #sm_frame_based_flow_json = sm_frame_based_flow_json.replace("##LAMBDA_WF_FRAME_SHOT_ANALYSIS##", lambda_eval_srv_wf_frame_shot_analysis.function_arn)
            #sm_frame_based_flow_json = sm_frame_based_flow_json.replace("##LAMBDA_WF_FRAME_SHOT_SUMMARY##", lambda_eval_srv_fw_frame_shot_summary.function_arn)
            sm_frame_based_flow_json = sm_frame_based_flow_json.replace("##LAMBDA_WF_START_TRANSCRIBE##", lambda_eval_srv_wf_start_transcribe.function_arn)
            sm_frame_based_flow_json = sm_frame_based_flow_json.replace("##LAMBDA_WF_TRANSCRIPT_POST_PROCESS##", lambda_eval_srv_wf_transcrip_post_process.function_arn)
            sm_frame_based_flow_json = sm_frame_based_flow_json.replace("##LAMBDA_WF_UPADATE_TASK_STATUS##", lambda_eval_srv_fw_update_task_status.function_arn)
            
        eval_srv_frame_based_flow_role = _iam.Role(
            self, "ExtrSrvFrameFlowRole",
            assumed_by=_iam.ServicePrincipal("states.amazonaws.com"),
            inline_policies={f"{sf_key}-poliy": _iam.PolicyDocument(
                statements=[
                    _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["s3:ListBucket","s3:GetObject","s3:PutObject","s3:DeleteObject"],
                        resources=[f"arn:aws:s3:::{self.s3_bucket_name_eval}",f"arn:aws:s3:::{self.s3_bucket_name_eval}/*"]
                    ),
                    _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["states:StartExecution","states:ListExecutions"],
                        resources=[f"arn:aws:states:{self.region}:{self.account_id}:stateMachine:{STEP_FUNCTIONS_NAME_PREFIX}{sf_key}"]
                    ),
                     _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["lambda:InvokeFunction"],
                        resources=[
                            f"arn:aws:lambda:{self.region}:{self.account_id}:function:{LAMBDA_NAME_PREFIX}eval-srv-*"
                        ]
                    ),
                    _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["xray:PutTraceSegments", "xray:PutTelemetryRecords", "xray:GetSamplingRules", "xray:GetSamplingTargets"],
                        resources=[f"*"]
                    ),
                    _iam.PolicyStatement(
                        actions=["ec2:DescribeNetworkInterfaces", "ec2:CreateNetworkInterface", "ec2:DeleteNetworkInterface",],
                        resources=["*"]
                    ),
                    _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["logs:CreateLogGroup"],
                        resources=[f"arn:aws:logs:{self.region}:{self.account_id}:*"]
                    ),
                    _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["logs:CreateLogStream", "logs:PutLogEvents"],
                        resources=[f"arn:aws:logs:{self.region}:{self.account_id}:*"]
                    ),
                    _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["transcribe:StartTranscriptionJob", "transcribe:DeleteTranscriptionJob","transcribe:GetTranscriptionJob"],
                        resources=["*"]
                    ),
                ]
            )}
        )
        self.sf_frame_based_flow = _aws_stepfunctions.StateMachine(self, f'{sf_key}',
            state_machine_name=f'{STEP_FUNCTIONS_NAME_PREFIX}{sf_key}', 
            definition_body=_aws_stepfunctions.DefinitionBody.from_string(sm_frame_based_flow_json),
            removal_policy=RemovalPolicy.DESTROY,
            role=eval_srv_frame_based_flow_role,
            timeout=Duration.hours(int(STEP_FUNCTIONS_FRAME_BASED_FLOW_TIMEOUT_HR)),
            tracing_enabled=True,
            logs= _aws_stepfunctions.LogOptions(
                destination=logs.LogGroup(self, f"/aws/vendedlogs/states/{sf_key}"),
                level=_aws_stepfunctions.LogLevel.ALL
            )
        )

        sf_key = "eval-srv-clip-based-flow"
        sm_clip_based_flow_json = None
        with open(f'../source/eval_service/stepfunctions/{sf_key}/code.txt', "r") as f:
            sm_clip_based_flow_json = str(f.read())

        if sm_clip_based_flow_json is not None:
            sm_clip_based_flow_json = sm_clip_based_flow_json.replace("##LAMBDA_WF_CLIP_METADATA##", lambda_eval_srv_fw_clip_metadata.function_arn)
            sm_clip_based_flow_json = sm_clip_based_flow_json.replace("##LAMBDA_WF_CLIP_GEN_SHOT_DURATION##", lambda_eval_srv_fw_clip_gen_shot_durtion.function_arn)
            sm_clip_based_flow_json = sm_clip_based_flow_json.replace("##LAMBDA_WF_CLIP_GEN_SHOT_VIDEO##", lambda_eval_srv_wf_clip_gen_shot_video.function_arn)
            sm_clip_based_flow_json = sm_clip_based_flow_json.replace("##LAMBDA_WF_CLIP_SHOT_UNDERSTANDING##", lambda_eval_srv_fw_clip_shot_understanding.function_arn)
            sm_clip_based_flow_json = sm_clip_based_flow_json.replace("##LAMBDA_WF_CLIP_SHOT_EMBED##", lambda_eval_srv_wf_clip_shot_embed.function_arn)
            sm_clip_based_flow_json = sm_clip_based_flow_json.replace("##LAMBDA_WF_START_TRANSCRIBE##", lambda_eval_srv_wf_start_transcribe.function_arn)
            sm_clip_based_flow_json = sm_clip_based_flow_json.replace("##LAMBDA_WF_TRANSCRIPT_POST_PROCESS##", lambda_eval_srv_wf_transcrip_post_process.function_arn)
            sm_clip_based_flow_json = sm_clip_based_flow_json.replace("##LAMBDA_WF_UPADATE_TASK_STATUS##", lambda_eval_srv_fw_update_task_status.function_arn)
            
        eval_srv_clip_based_flow_role = _iam.Role(
            self, "ExtrSrvCLipFlowRole",
            assumed_by=_iam.ServicePrincipal("states.amazonaws.com"),
            inline_policies={f"{sf_key}-poliy": _iam.PolicyDocument(
                statements=[
                    _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["s3:ListBucket","s3:GetObject","s3:PutObject","s3:DeleteObject"],
                        resources=[f"arn:aws:s3:::{self.s3_bucket_name_eval}",f"arn:aws:s3:::{self.s3_bucket_name_eval}/*"]
                    ),
                    _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["states:StartExecution","states:ListExecutions"],
                        resources=[f"arn:aws:states:{self.region}:{self.account_id}:stateMachine:{STEP_FUNCTIONS_NAME_PREFIX}{sf_key}"]
                    ),
                    _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["sns:Publish"],
                        resources=[f"arn:aws:sns:{self.region}:{self.account_id}:*"]
                    ),
                     _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["lambda:InvokeFunction"],
                        resources=[
                            f"arn:aws:lambda:{self.region}:{self.account_id}:function:{LAMBDA_NAME_PREFIX}eval-srv-*"
                        ]
                    ),
                    _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["xray:PutTraceSegments", "xray:PutTelemetryRecords", "xray:GetSamplingRules", "xray:GetSamplingTargets"],
                        resources=[f"*"]
                    ),
                    _iam.PolicyStatement(
                        actions=["ec2:DescribeNetworkInterfaces", "ec2:CreateNetworkInterface", "ec2:DeleteNetworkInterface",],
                        resources=["*"]
                    ),
                    _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["logs:CreateLogGroup"],
                        resources=[f"arn:aws:logs:{self.region}:{self.account_id}:*"]
                    ),
                    _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["logs:CreateLogStream", "logs:PutLogEvents"],
                        resources=[f"arn:aws:logs:{self.region}:{self.account_id}:*"]
                    ),
                    _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["transcribe:StartTranscriptionJob", "transcribe:DeleteTranscriptionJob","transcribe:GetTranscriptionJob"],
                        resources=["*"]
                    ),
                ]
            )}
        )
        self.sf_clip_based_flow = _aws_stepfunctions.StateMachine(self, f'{sf_key}',
            state_machine_name=f'{STEP_FUNCTIONS_NAME_PREFIX}{sf_key}', 
            definition_body=_aws_stepfunctions.DefinitionBody.from_string(sm_clip_based_flow_json),
            removal_policy=RemovalPolicy.DESTROY,
            role=eval_srv_clip_based_flow_role,
            timeout=Duration.hours(int(STEP_FUNCTIONS_CLIP_BASED_FLOW_TIMEOUT_HR)),
            tracing_enabled=True,
            logs= _aws_stepfunctions.LogOptions(
                destination=logs.LogGroup(self, f"/aws/vendedlogs/states/{sf_key}"),
                level=_aws_stepfunctions.LogLevel.ALL
            )
        )
        # Step Function - end

    def deploy_apigw(self):
        # API Gateway - start
        api = _apigw.RestApi(self, f"{API_NAME_PREFIX}Serice",
                                rest_api_name=f"{API_NAME_PREFIX}-service",
                                cloud_watch_role=True,
                                cloud_watch_role_removal_policy=RemovalPolicy.DESTROY,
                                deploy_options=_apigw.StageOptions(
                                        tracing_enabled=True,
                                        access_log_destination=_apigw.LogGroupLogDestination(logs.LogGroup(self, f"{API_NAME_PREFIX}ApiGatewayExtrSrvAccessLog")),
                                        access_log_format=_apigw.AccessLogFormat.clf(),
                                        method_options={
                                            "/*/*": _apigw.MethodDeploymentOptions( # This special path applies to all resource paths and all HTTP methods
                                                logging_level=_apigw.MethodLoggingLevel.INFO,)
                                    }                               
                                ),   
                            )

        # Create resources
        v1 = api.root.add_resource("v1")
        video = v1.add_resource("video")
        analyze = v1.add_resource("analyze")
        model = v1.add_resource("model")
        gt = v1.add_resource("gt")
        eval_resource = v1.add_resource("eval")
        utils = v1.add_resource("utils")
        chatbot = v1.add_resource("chatbot")
        
        self.api_gw_base_url = api.url
        
        # POST /v1/utils/manage-s3-presigned-url
        lambda_key='eval-srv-api-manage-s3-presigned-url'
        lambda_es_manage_s3_url_role = self.create_role(lambda_key, ["s3"])
        self.create_api_endpoint(id=f'{lambda_key}-ep', root=utils, path1="manage-s3-presigned-url", method="POST", auth=self.cognito_authorizer, 
                role=lambda_es_manage_s3_url_role,
                lambda_file_name=lambda_key,
                memory_m=128, timeout_s=10, ephemeral_storage_size=512,
                evns={
                    'S3_PRESIGNED_URL_EXPIRY_S': S3_PRESIGNED_URL_EXPIRY_S,
                    'VIDEO_UPLOAD_S3_BUCKET': self.s3_bucket_name_eval,
                    'VIDEO_UPLOAD_S3_PREFIX': VIDEO_UPLOAD_S3_PREFIX
                },
            )   

        # POST /v1/utils/manage-api-key
        lambda_key='eval-srv-api-manage-api-key'
        lambda_manage_api_key_role = self.create_role(lambda_key, ["secretsmanager"])
        self.create_api_endpoint(id=f'{lambda_key}-ep', root=utils, path1="manage-api-key", method="POST", auth=self.cognito_authorizer, 
                role=lambda_manage_api_key_role,
                lambda_file_name=lambda_key,
                memory_m=128, timeout_s=10, ephemeral_storage_size=512,
                evns={},
            )

        # POST /v1/chatbot/converse
        lambda_key='eval-srv-api-chatbot-converse'
        lambda_chatbot_role = self.create_role(lambda_key, ["dynamodb", "bedrock", "lambda"])
        self.create_api_endpoint(id=f'{lambda_key}-ep', root=chatbot, path1="converse", method="POST", auth=self.cognito_authorizer, 
                role=lambda_chatbot_role,
                lambda_file_name=lambda_key,
                memory_m=1024, timeout_s=60, ephemeral_storage_size=512,
                evns={},
                layers=[self.strands_agents_layer]
            )

        # POST /v1/video/add-video
        lambda_key='eval-srv-add-video'
        lambda_add_video_role = self.create_role(lambda_key, ["dynamodb", "lambda"])
        
        # Create metadata extraction Lambda first (needed for add-video env var)
        lambda_metadata_key = 'eval-srv-get-video-metadata'
        lambda_metadata_role = self.create_role(lambda_metadata_key, ["dynamodb", "s3", "bedrock"])
        lambda_get_video_metadata = self.create_lambda(
            lambda_metadata_key,
            lambda_metadata_role,
            {
                'DYNAMO_VIDEO_TABLE': DYNAMO_VIDEO_TABLE,
                'MODEL_ID_IMAGE_UNDERSTANDING': MODEL_ID_IMAGE_UNDERSTANDING,
                'DYNAMO_VIDEO_USAGE_TABLE': DYNAMO_VIDEO_USAGE_TABLE
            },
            timeout_s=300, memory_size=2048, ephemeral_storage_size=2048,
            layers=[self.moviepy_layer]
        )
        
        # Note: Nova MME Lambda will be created by the API endpoint below
        # We reference it by its function name here
        self.create_api_endpoint(id=f'{lambda_key}-ep', root=video, path1="add-video", method="POST", auth=self.cognito_authorizer, 
                role=lambda_add_video_role,
                lambda_file_name=lambda_key,
                memory_m=128, timeout_s=10, ephemeral_storage_size=512,
                evns={
                    'DYNAMO_VIDEO_TABLE': DYNAMO_VIDEO_TABLE,
                    'METADATA_LAMBDA_NAME': lambda_get_video_metadata.function_name,
                    'NOVA_MME_LAMBDA_NAME': f"{LAMBDA_NAME_PREFIX}eval-srv-api-start-nova-mme",
                    'TLABS_MME_LAMBDA_NAME': f"{LAMBDA_NAME_PREFIX}eval-srv-api-start-tlabs-mme"
                },
            )   

        # POST /v1/video/get-videos
        lambda_key='eval-srv-get-videos'
        lambda_get_videos_role = self.create_role(lambda_key, ["dynamodb","s3"])
        self.create_api_endpoint(id=f'{lambda_key}-ep', root=video, path1="get-videos", method="POST", auth=self.cognito_authorizer, 
                role=lambda_get_videos_role,
                lambda_file_name=lambda_key,
                memory_m=256, timeout_s=30, ephemeral_storage_size=512,
                evns={
                    'DYNAMO_VIDEO_TABLE': DYNAMO_VIDEO_TABLE,
                    'DYNAMO_GROUND_TRUTH_TABLE': DYNAMO_GROUND_TRUTH_TABLE,
                    'S3_PRESIGNED_URL_EXPIRY_S': S3_PRESIGNED_URL_EXPIRY_S
                },
            )   

        # POST /v1/video/delete-video
        lambda_key='eval-srv-delete-video'
        lambda_delete_video_role = self.create_role(lambda_key, ["dynamodb","s3","s3vectors"])
        self.create_api_endpoint(id=f'{lambda_key}-ep', root=video, path1="delete-video", method="POST", auth=self.cognito_authorizer, 
                role=lambda_delete_video_role,
                lambda_file_name=lambda_key,
                memory_m=256, timeout_s=30, ephemeral_storage_size=512,
                evns={
                    'DYNAMO_VIDEO_TABLE': DYNAMO_VIDEO_TABLE,
                    'DYNAMO_VIDEO_ANALYZE_TABLE': DYNAMO_VIDEO_ANALYZE_TABLE,
                    'S3_VECTOR_BUCKET': S3_VECTOR_BUCKET_NAME,
                    'S3_VECTOR_INDEX': S3_VECTOR_INDEX_NAME
                },
            )   

        # POST /v1/analyze/delete-analyze-task
        lambda_key='eval-srv-delete-analyze-task'
        lambda_delete_analyze_task_role = self.create_role(lambda_key, ["dynamodb","s3","s3vectors"])
        self.create_api_endpoint(id=f'{lambda_key}-ep', root=analyze, path1="delete-analyze-task", method="POST", auth=self.cognito_authorizer, 
                role=lambda_delete_analyze_task_role,
                lambda_file_name=lambda_key,
                memory_m=256, timeout_s=30, ephemeral_storage_size=512,
                evns={
                    'DYNAMO_VIDEO_ANALYZE_TABLE': DYNAMO_VIDEO_ANALYZE_TABLE,
                    'S3_VECTOR_BUCKET': S3_VECTOR_BUCKET_NAME
                },
            )

        # POST /v1/analyze/get-analyze-tasks
        lambda_key='eval-srv-get-analyze-tasks'
        lambda_get_analyze_tasks_role = self.create_role(lambda_key, ["dynamodb"])
        self.create_api_endpoint(id=f'{lambda_key}-ep', root=analyze, path1="get-analyze-tasks", method="POST", auth=self.cognito_authorizer, 
                role=lambda_get_analyze_tasks_role,
                lambda_file_name=lambda_key,
                memory_m=256, timeout_s=30, ephemeral_storage_size=512,
                evns={
                    'DYNAMO_VIDEO_ANALYZE_TABLE': DYNAMO_VIDEO_ANALYZE_TABLE
                },
            )   

        # POST /v1/model/start-nova-mme
        lambda_key='eval-srv-api-start-nova-mme'
        lambda_start_nova_mme_role = self.create_role(lambda_key, ["dynamodb","s3","bedrock"])
        self.create_api_endpoint(id=f'{lambda_key}-api-ep', root=model, path1="start-nova-mme", method="POST", auth=self.cognito_authorizer, 
                role=lambda_start_nova_mme_role,
                lambda_file_name=lambda_key,
                memory_m=256, timeout_s=60, ephemeral_storage_size=512,
                evns={
                    'DYNAMO_VIDEO_TABLE': DYNAMO_VIDEO_TABLE,
                    'DYNAMO_VIDEO_ANALYZE_TABLE': DYNAMO_VIDEO_ANALYZE_TABLE,
                    'EMBEDDING_DIM': EMBEDDING_DIM_DEFAULT,
                    'DEFAULT_NOVA_MME_MODEL_ID': MODEL_ID_video_evalE
                },
            )

        # POST /v1/model/start-tlabs-mme
        lambda_key='eval-srv-api-start-tlabs-mme'
        lambda_start_tlabs_mme_role = self.create_role(lambda_key, ["dynamodb","s3","bedrock"])
        self.create_api_endpoint(id=f'{lambda_key}-api-ep', root=model, path1="start-tlabs-mme", method="POST", auth=self.cognito_authorizer, 
                role=lambda_start_tlabs_mme_role,
                lambda_file_name=lambda_key,
                memory_m=256, timeout_s=60, ephemeral_storage_size=512,
                evns={
                    'DYNAMO_VIDEO_TABLE': DYNAMO_VIDEO_TABLE,
                    'DYNAMO_VIDEO_ANALYZE_TABLE': DYNAMO_VIDEO_ANALYZE_TABLE,
                    'DEFAULT_TLABS_MME_MODEL_ID': 'twelvelabs.marengo-embed-3-0-v1:0'
                },
            )

        # POST /v1/model/nova-mme-search-vector
        lambda_key='eval-srv-api-nova-mme-search-vector'
        lambda_search_vector_role = self.create_role(lambda_key, ["dynamodb","s3","bedrock","s3vectors"])
        self.create_api_endpoint(id=f'{lambda_key}-api-ep', root=model, path1="nova-mme-search-vector", method="POST", auth=self.cognito_authorizer, 
                role=lambda_search_vector_role,
                lambda_file_name=lambda_key,
                memory_m=512, timeout_s=60, ephemeral_storage_size=512,
                evns={
                    'S3_PRESIGNED_URL_EXPIRY_S': S3_PRESIGNED_URL_EXPIRY_S,
                    'S3_BUCKET_DATA': self.s3_bucket_name_eval,
                    'DYNAMO_VIDEO_TASK_TABLE': DYNAMO_VIDEO_ANALYZE_TABLE,
                    'MODEL_ID': MODEL_ID_video_evalE,
                    'NOVA_S3_VECTOR_BUCKET': S3_VECTOR_BUCKET_NAME,
                    'NOVA_S3_VECTOR_INDEX': S3_VECTOR_INDEX_NAME,
                    'EMBEDDING_DIM': EMBEDDING_DIM_DEFAULT
                },
                layers=[self.boto3_layer]
            )

        # POST /v1/model/tlabs-mme-search-vector
        lambda_key='eval-srv-api-tlabs-mme-search-vector'
        lambda_tlabs_search_vector_role = self.create_role(lambda_key, ["dynamodb","s3","bedrock","s3vectors"])
        self.create_api_endpoint(id=f'{lambda_key}-api-ep', root=model, path1="tlabs-mme-search-vector", method="POST", auth=self.cognito_authorizer, 
                role=lambda_tlabs_search_vector_role,
                lambda_file_name=lambda_key,
                memory_m=512, timeout_s=60, ephemeral_storage_size=512,
                evns={
                    'S3_PRESIGNED_URL_EXPIRY_S': S3_PRESIGNED_URL_EXPIRY_S,
                    'S3_BUCKET_DATA': self.s3_bucket_name_eval,
                    'DYNAMO_VIDEO_ANALYZE_TABLE': DYNAMO_VIDEO_ANALYZE_TABLE,
                    'DYNAMO_VIDEO_TABLE': DYNAMO_VIDEO_TABLE,
                    'MODEL_ID_TLAB_27': MODEL_ID_TLABS_27,
                    'MODEL_ID_TLAB_30': MODEL_ID_TLABS_30,
                    'TLABS_S3_VECTOR_BUCKET': S3_VECTOR_BUCKET_NAME
                },
                layers=[self.boto3_layer]
            )

        # POST /v1/model/tlabs-pegasus
        lambda_key='eval-srv-api-tlabs-pegasus'
        lambda_tlabs_pegasus_role = self.create_role(lambda_key, ["dynamodb","s3","bedrock"])
        self.create_api_endpoint(id=f'{lambda_key}-api-ep', root=model, path1="tlabs-pegasus", method="POST", auth=self.cognito_authorizer, 
                role=lambda_tlabs_pegasus_role,
                lambda_file_name=lambda_key,
                memory_m=256, timeout_s=300, ephemeral_storage_size=512,
                evns={
                    'DYNAMO_VIDEO_TABLE': DYNAMO_VIDEO_TABLE,
                    'DYNAMO_VIDEO_ANALYZE_TABLE': DYNAMO_VIDEO_ANALYZE_TABLE,
                    'DEFAULT_TLABS_PEGASUS_MODEL_ID': 'twelvelabs.pegasus-1-0-v1:0'
                },
            )

        # POST /v1/model/bedrock-converse
        lambda_key='eval-srv-api-bedrock-converse'
        lambda_bedrock_converse_role = self.create_role(lambda_key, ["dynamodb","s3","bedrock"])
        self.create_api_endpoint(id=f'{lambda_key}-api-ep', root=model, path1="bedrock-converse", method="POST", auth=self.cognito_authorizer, 
                role=lambda_bedrock_converse_role,
                lambda_file_name=lambda_key,
                memory_m=3008, timeout_s=300, ephemeral_storage_size=10240,
                evns={
                    'DYNAMO_VIDEO_TABLE': DYNAMO_VIDEO_TABLE,
                    'DYNAMO_VIDEO_ANALYZE_TABLE': DYNAMO_VIDEO_ANALYZE_TABLE,
                    'DEFAULT_BEDROCK_CONVERSE_MODEL_ID': 'amazon.nova-pro-v1:0'
                },
            )

        # POST /v1/model/gemini
        lambda_key='eval-srv-api-gemini'
        lambda_gemini_role = self.create_role(lambda_key, ["dynamodb","s3","secretsmanager"])
        self.create_api_endpoint(id=f'{lambda_key}-api-ep', root=model, path1="gemini", method="POST", auth=self.cognito_authorizer, 
                role=lambda_gemini_role,
                lambda_file_name=lambda_key,
                memory_m=3008, timeout_s=600, ephemeral_storage_size=10240,
                evns={
                    'DYNAMO_VIDEO_TABLE': DYNAMO_VIDEO_TABLE,
                    'DYNAMO_VIDEO_ANALYZE_TABLE': DYNAMO_VIDEO_ANALYZE_TABLE,
                    'DEFAULT_GEMINI_MODEL_ID': 'gemini-1.5-flash'
                },
                layers=[self.google_layer]
            )

        # POST /v1/model/start-video-understanding
        lambda_key='eval-srv-api-start-video-understanding'
        lambda_start_video_understanding_role = self.create_role(lambda_key, ["dynamodb","lambda","secretsmanager"])
        self.create_api_endpoint(id=f'{lambda_key}-api-ep', root=model, path1="start-video-understanding", method="POST", auth=self.cognito_authorizer, 
                role=lambda_start_video_understanding_role,
                lambda_file_name=lambda_key,
                memory_m=256, timeout_s=30, ephemeral_storage_size=512,
                evns={
                    'DYNAMO_VIDEO_TABLE': DYNAMO_VIDEO_TABLE,
                    'DYNAMO_VIDEO_ANALYZE_TABLE': DYNAMO_VIDEO_ANALYZE_TABLE,
                    'LAMBDA_BEDROCK_CONVERSE': f"{LAMBDA_NAME_PREFIX}eval-srv-api-bedrock-converse",
                    'LAMBDA_TLABS_PEGASUS': f"{LAMBDA_NAME_PREFIX}eval-srv-api-tlabs-pegasus",
                    'LAMBDA_GEMINI': f"{LAMBDA_NAME_PREFIX}eval-srv-api-gemini"
                },
            )

        # POST /v1/gt/upsert-ground-truth
        lambda_key='eval-srv-upsert-ground-truth'
        lambda_upsert_ground_truth_role = self.create_role(lambda_key, ["dynamodb"])
        self.create_api_endpoint(id=f'{lambda_key}-ep', root=gt, path1="upsert-ground-truth", method="POST", auth=self.cognito_authorizer, 
                role=lambda_upsert_ground_truth_role,
                lambda_file_name=lambda_key,
                memory_m=256, timeout_s=30, ephemeral_storage_size=512,
                evns={
                    'DYNAMO_GROUND_TRUTH_TABLE': DYNAMO_GROUND_TRUTH_TABLE
                },
            )

        # POST /v1/gt/get-ground-truths
        lambda_key='eval-srv-get-ground-truths'
        lambda_get_ground_truths_role = self.create_role(lambda_key, ["dynamodb", "s3"])
        self.create_api_endpoint(id=f'{lambda_key}-ep', root=gt, path1="get-ground-truths", method="POST", auth=self.cognito_authorizer, 
                role=lambda_get_ground_truths_role,
                lambda_file_name=lambda_key,
                memory_m=256, timeout_s=30, ephemeral_storage_size=512,
                evns={
                    'DYNAMO_GROUND_TRUTH_TABLE': DYNAMO_GROUND_TRUTH_TABLE,
                    'DYNAMO_VIDEO_TABLE': DYNAMO_VIDEO_TABLE,
                    'DYNAMO_VIDEO_ANALYZE_TABLE': DYNAMO_VIDEO_ANALYZE_TABLE,
                    'DYNAMO_EVALUATION_TASK_TABLE': DYNAMO_EVALUATION_TASK_TABLE,
                    'S3_PRESIGNED_URL_EXPIRY_S': S3_PRESIGNED_URL_EXPIRY_S
                },
            )

        # POST /v1/gt/delete-ground-truth
        lambda_key='eval-srv-delete-ground-truth'
        lambda_delete_ground_truth_role = self.create_role(lambda_key, ["dynamodb"])
        self.create_api_endpoint(id=f'{lambda_key}-ep', root=gt, path1="delete-ground-truth", method="POST", auth=self.cognito_authorizer, 
                role=lambda_delete_ground_truth_role,
                lambda_file_name=lambda_key,
                memory_m=256, timeout_s=30, ephemeral_storage_size=512,
                evns={
                    'DYNAMO_GROUND_TRUTH_TABLE': DYNAMO_GROUND_TRUTH_TABLE
                },
            )

        # POST /v1/eval/upsert-evaluation-task
        lambda_key='eval-srv-upsert-evaluation-task'
        lambda_upsert_evaluation_task_role = self.create_role(lambda_key, ["dynamodb"])
        self.create_api_endpoint(id=f'{lambda_key}-ep', root=eval_resource, path1="upsert-evaluation-task", method="POST", auth=self.cognito_authorizer, 
                role=lambda_upsert_evaluation_task_role,
                lambda_file_name=lambda_key,
                memory_m=256, timeout_s=30, ephemeral_storage_size=512,
                evns={
                    'DYNAMO_EVALUATION_TASK_TABLE': DYNAMO_EVALUATION_TASK_TABLE
                },
            )

        # POST /v1/eval/get-evaluation-tasks
        lambda_key='eval-srv-get-evaluation-tasks'
        lambda_get_evaluation_tasks_role = self.create_role(lambda_key, ["dynamodb", "s3"])
        self.create_api_endpoint(id=f'{lambda_key}-ep', root=eval_resource, path1="get-evaluation-tasks", method="POST", auth=self.cognito_authorizer, 
                role=lambda_get_evaluation_tasks_role,
                lambda_file_name=lambda_key,
                memory_m=256, timeout_s=30, ephemeral_storage_size=512,
                evns={
                    'DYNAMO_EVALUATION_TASK_TABLE': DYNAMO_EVALUATION_TASK_TABLE,
                    'DYNAMO_GROUND_TRUTH_TABLE': DYNAMO_GROUND_TRUTH_TABLE,
                    'DYNAMO_VIDEO_TABLE': DYNAMO_VIDEO_TABLE,
                    'DYNAMO_VIDEO_ANALYZE_TABLE': DYNAMO_VIDEO_ANALYZE_TABLE,
                    'S3_PRESIGNED_URL_EXPIRY_S': S3_PRESIGNED_URL_EXPIRY_S
                },
            )

        # POST /v1/eval/delete-evaluation-task
        lambda_key='eval-srv-delete-evaluation-task'
        lambda_delete_evaluation_task_role = self.create_role(lambda_key, ["dynamodb"])
        self.create_api_endpoint(id=f'{lambda_key}-ep', root=eval_resource, path1="delete-evaluation-task", method="POST", auth=self.cognito_authorizer, 
                role=lambda_delete_evaluation_task_role,
                lambda_file_name=lambda_key,
                memory_m=256, timeout_s=30, ephemeral_storage_size=512,
                evns={
                    'DYNAMO_EVALUATION_TASK_TABLE': DYNAMO_EVALUATION_TASK_TABLE
                },
            )

        # API Gateway - end

    def create_role(self, function_name, policies):
        statements=[
            _iam.PolicyStatement(
                effect=_iam.Effect.ALLOW,
                actions=["logs:CreateLogGroup"],
                resources=[f"arn:aws:logs:{self.region}:{self.account_id}:*"]
            ),
            _iam.PolicyStatement(
                effect=_iam.Effect.ALLOW,
                actions=["logs:CreateLogStream", "logs:PutLogEvents"],
                resources=[f"arn:aws:logs:{self.region}:{self.account_id}:log-group:/aws/lambda/{LAMBDA_NAME_PREFIX}{function_name}:*"]
            )
        ]
        if "s3" in policies:
            statements.append(
                _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["s3:ListBucket","s3:GetObject","s3:PutObject","s3:DeleteObject"],
                        resources=[f"arn:aws:s3:::{self.s3_bucket_name_eval}",f"arn:aws:s3:::{self.s3_bucket_name_eval}/*"]
                    )
            )
        if "dynamodb" in policies:
            statements.append(
                _iam.PolicyStatement(
                        actions=["dynamodb:DeleteItem","dynamodb:Query", "dynamodb:Scan", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:GetItem","dynamodb:DescribeTable","dynamodb:BatchWriteItem"],
                        resources=[
                            f"arn:aws:dynamodb:{self.region}:{self.account_id}:table/{DYNAMO_VIDEO_TABLE}/index/*",
                            f"arn:aws:dynamodb:{self.region}:{self.account_id}:table/{DYNAMO_VIDEO_ANALYZE_TABLE}/index/*",
                            f"arn:aws:dynamodb:{self.region}:{self.account_id}:table/{DYNAMO_VIDEO_FRAME_TABLE}/index/*",
                            f"arn:aws:dynamodb:{self.region}:{self.account_id}:table/{DYNAMO_VIDEO_SHOT_TABLE}/index/*",
                            f"arn:aws:dynamodb:{self.region}:{self.account_id}:table/{DYNAMO_VIDEO_USAGE_TABLE}/index/*",
                            f"arn:aws:dynamodb:{self.region}:{self.account_id}:table/{DYNAMO_GROUND_TRUTH_TABLE}/index/*",
                            f"arn:aws:dynamodb:{self.region}:{self.account_id}:table/{DYNAMO_EVALUATION_TASK_TABLE}/index/*",
                            f"arn:aws:dynamodb:{self.region}:{self.account_id}:table/{DYNAMO_VIDEO_TABLE}",
                            f"arn:aws:dynamodb:{self.region}:{self.account_id}:table/{DYNAMO_VIDEO_ANALYZE_TABLE}",
                            f"arn:aws:dynamodb:{self.region}:{self.account_id}:table/{DYNAMO_VIDEO_FRAME_TABLE}",
                            f"arn:aws:dynamodb:{self.region}:{self.account_id}:table/{DYNAMO_VIDEO_SHOT_TABLE}",
                            f"arn:aws:dynamodb:{self.region}:{self.account_id}:table/{DYNAMO_VIDEO_USAGE_TABLE}",
                            f"arn:aws:dynamodb:{self.region}:{self.account_id}:table/{DYNAMO_GROUND_TRUTH_TABLE}",
                            f"arn:aws:dynamodb:{self.region}:{self.account_id}:table/{DYNAMO_EVALUATION_TASK_TABLE}",
                        ]
                    ))
        if "bedrock" in policies:
            statements.append(
                _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["bedrock:InvokeModel","bedrock:InvokeModelWithResponseStream","bedrock:GetAsyncInvoke"],
                        resources=[
                            "arn:aws:bedrock:*:*:foundation-model/*",
                            "arn:aws:bedrock:*:*:async-invoke/*",
                            "arn:aws:bedrock:*:*:inference-profile/*"
                        ]
                    )
            )
            statements.append(
                _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["aws-marketplace:ViewSubscriptions","aws-marketplace:Subscribe"],
                        resources=[f"*"]
                    ),
            )
        if "states" in policies:
            statements.append(
                _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["states:ListExecutions","states:StartExecution"],
                        resources=[f"arn:aws:states:{self.region}:{self.account_id}:stateMachine:*"]
                    )
            )
        if "s3vectors" in policies:
            statements.append(
                _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=[
                            "s3vectors:CreateIndex",
                            "s3vectors:DeleteIndex",
                            "s3vectors:DescribeIndex",
                            "s3vectors:ListIndexes",
                            "s3vectors:PutVectors",
                            "s3vectors:GetVectors",
                            "s3vectors:DeleteVectors",
                            "s3vectors:QueryVectors"
                        ],
                        resources=[
                            f"arn:aws:s3vectors:{self.region}:{self.account_id}:bucket/{S3_VECTOR_BUCKET_NAME}",
                            f"arn:aws:s3vectors:{self.region}:{self.account_id}:bucket/{S3_VECTOR_BUCKET_NAME}/*"
                        ]
                    )
            )
        if "lambda" in policies:
            statements.append(
                 _iam.PolicyStatement(
                    effect=_iam.Effect.ALLOW,
                    actions=["lambda:InvokeFunction"],
                    resources=[
                        f"arn:aws:lambda:{self.region}:{self.account_id}:function:{LAMBDA_NAME_PREFIX}eval-srv*"
                    ]
                ),
            )
        if "transcribe" in policies:
            statements.append(
                _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["transcribe:StartTranscriptionJob", "transcribe:DeleteTranscriptionJob","transcribe:GetTranscriptionJob"],
                        resources=["*"]
                    ),
            )
        if "sagemaker" in policies:
            statements.append(
                _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["sagemaker:DescribeNotebookInstance","sagemaker:CreatePresignedNotebookInstanceUrl"],
                        resources=[f"arn:aws:sagemaker:{self.region}:{self.account_id}:notebook-instance/*"]
                    ),
            )
        if "secretsmanager" in policies:
            statements.append(
                _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["secretsmanager:GetSecretValue","secretsmanager:DescribeSecret","secretsmanager:CreateSecret","secretsmanager:PutSecretValue","secretsmanager:DeleteSecret","secretsmanager:ListSecrets"],
                        resources=[f"arn:aws:secretsmanager:{self.region}:{self.account_id}:secret:gemini-api-key/*"]
                    ),
            )
            # Add permission to list all secrets (for debugging)
            statements.append(
                _iam.PolicyStatement(
                        effect=_iam.Effect.ALLOW,
                        actions=["secretsmanager:ListSecrets"],
                        resources=["*"]
                    ),
            )


        return _iam.Role(
            self, f"{function_name}-role",
            assumed_by=_iam.ServicePrincipal("lambda.amazonaws.com"),
            inline_policies={f"{function_name}-poliy": _iam.PolicyDocument(
            statements=statements
        )}
    )   

    def create_lambda(self, function_name, role, environment, timeout_s=30, memory_size=128, ephemeral_storage_size=512, layers=[]):
        return _lambda.Function(self, 
            id=f'{function_name}-lambda', 
            function_name=f'{LAMBDA_NAME_PREFIX}{function_name}', 
            runtime=_lambda.Runtime.PYTHON_3_13,
            handler=f'{function_name}.lambda_handler',
            code=_lambda.Code.from_asset(os.path.join("../source/", f"eval_service/lambda/{function_name}")),
            timeout=Duration.seconds(timeout_s),
            memory_size=memory_size,
            ephemeral_storage_size=Size.mebibytes(ephemeral_storage_size),
            role=role,
            environment=environment,
            layers=layers,
        )

    def create_api_endpoint(self, id, root, path1, method, auth, role, lambda_file_name, memory_m, timeout_s, ephemeral_storage_size, evns, layers=None):
        lambda_function = _lambda.Function(self, 
            id=f'{lambda_file_name}-lambda', 
            function_name=f'{LAMBDA_NAME_PREFIX}{lambda_file_name}', 
            runtime=_lambda.Runtime.PYTHON_3_13,
            handler=f'{lambda_file_name}.lambda_handler',
            code=_lambda.Code.from_asset(os.path.join("../source/", f"eval_service/lambda/{lambda_file_name}")),
            timeout=Duration.seconds(timeout_s),
            memory_size=memory_m,
            ephemeral_storage_size=Size.mebibytes(ephemeral_storage_size),
            role=role,
            environment=evns,
            layers=layers,
        )

        resource = root.add_resource(
                path1, 
                default_cors_preflight_options=_apigw.CorsOptions(
                allow_methods=[method, 'OPTIONS'],
                allow_origins=_apigw.Cors.ALL_ORIGINS),
        )

        resource.add_method(
            method, 
            _apigw.LambdaIntegration(
                lambda_function,
                proxy=True
            ),
            authorizer=auth,
            authorization_type=_apigw.AuthorizationType.COGNITO
        )