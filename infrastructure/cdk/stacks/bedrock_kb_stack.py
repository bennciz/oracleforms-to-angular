"""BedrockKBStack — Knowledge Base + OpenSearch Serverless for RAG Q&A.

Uses L1 (Cfn*) constructs: the L2 Bedrock KB constructs are not yet stable.
An OpenSearch Serverless VECTORSEARCH collection is the vector store; the KB
uses Titan Embeddings v2 and points its data source at the artifact bucket so
all ingested Forms XML + PL/SQL source becomes searchable by developers.

The vector index inside the collection MUST exist before the KB can be created
(CfnKnowledgeBase validates it synchronously — otherwise Bedrock returns a
403 security_exception). AOSS indexes cannot be created by CloudFormation, so a
Lambda-backed custom resource (custom_resources/aoss_index) creates the k-NN
index first and the KB is ordered after it via add_dependency.
"""
from aws_cdk import (
    Stack,
    CfnOutput,
    CustomResource,
    Duration,
    aws_opensearchserverless as aoss,
    aws_bedrock as bedrock,
    aws_iam as iam,
    aws_lambda as _lambda,
    custom_resources as cr,
    aws_logs as logs,
)
from constructs import Construct
import json


class BedrockKbStack(Stack):
    INDEX_NAME = "oracle-kb-index"
    VECTOR_FIELD = "bedrock-knowledge-base-default-vector"
    TEXT_FIELD = "AMAZON_BEDROCK_TEXT_CHUNK"
    METADATA_FIELD = "AMAZON_BEDROCK_METADATA"
    # Titan Text Embeddings v2 default output dimension.
    EMBED_DIMENSION = 1024

    def __init__(self, scope: Construct, cid: str, *, prefix: str,
                 security, storage, **kwargs):
        super().__init__(scope, cid, **kwargs)
        self.prefix = prefix
        collection_name = f"{prefix}-kb"
        kb_role_arn = security.bedrock_kb_role.role_arn
        region = Stack.of(self).region
        acct = Stack.of(self).account

        # --- Index-creator Lambda (custom resource) --------------------------
        # Creates the k-NN vector index in the collection BEFORE the KB. Built
        # here (not in SecurityStack) so its data-plane grant + AOSS access
        # policy principal stay in this stack. opensearch-py is bundled via a
        # Docker build of custom_resources/aoss_index.
        index_fn = _lambda.DockerImageFunction(
            self, "AossIndexFn",
            function_name=f"{prefix}-aoss-index-creator",
            code=_lambda.DockerImageCode.from_image_asset(
                "custom_resources/aoss_index"),
            # Match Lambda arch to the local Docker build arch (arm64 on Apple
            # Silicon); a mismatch causes Runtime.ProcessSpawnFailed.
            architecture=_lambda.Architecture.ARM_64,
            timeout=Duration.minutes(5),
            memory_size=512,
        )
        index_fn.add_to_role_policy(iam.PolicyStatement(
            actions=["aoss:APIAccessAll"],
            resources=[f"arn:aws:aoss:{region}:{acct}:collection/*"],
        ))
        index_fn_role_arn = index_fn.role.role_arn

        # --- OpenSearch Serverless security/network/data-access policies -----
        encryption_policy = aoss.CfnSecurityPolicy(
            self, "KbEncryptionPolicy",
            name=f"{prefix}-enc",
            type="encryption",
            policy=json.dumps({
                "Rules": [{"ResourceType": "collection",
                           "Resource": [f"collection/{collection_name}"]}],
                "AWSOwnedKey": True,
            }),
        )
        network_policy = aoss.CfnSecurityPolicy(
            self, "KbNetworkPolicy",
            name=f"{prefix}-net",
            type="network",
            policy=json.dumps([{
                "Rules": [
                    {"ResourceType": "collection",
                     "Resource": [f"collection/{collection_name}"]},
                    {"ResourceType": "dashboard",
                     "Resource": [f"collection/{collection_name}"]},
                ],
                "AllowFromPublic": True,  # POC; tighten to VPC endpoint for prod
            }]),
        )
        data_access_policy = aoss.CfnAccessPolicy(
            self, "KbDataAccessPolicy",
            name=f"{prefix}-access",
            type="data",
            policy=json.dumps([{
                "Rules": [
                    {"ResourceType": "collection",
                     "Resource": [f"collection/{collection_name}"],
                     "Permission": ["aoss:*"]},
                    {"ResourceType": "index",
                     "Resource": [f"index/{collection_name}/*"],
                     "Permission": ["aoss:*"]},
                ],
                # KB role + the index-creator Lambda role (creates the index).
                "Principal": [kb_role_arn, index_fn_role_arn],
            }]),
        )

        self.collection = aoss.CfnCollection(
            self, "KbCollection",
            name=collection_name,
            type="VECTORSEARCH",
            description=f"{prefix} legacy-code RAG vector store",
        )
        self.collection.add_dependency(encryption_policy)
        self.collection.add_dependency(network_policy)
        self.collection.add_dependency(data_access_policy)

        # --- Create the vector index (must exist before the KB) --------------
        index_provider = cr.Provider(
            self, "AossIndexProvider",
            on_event_handler=index_fn,
            log_retention=logs.RetentionDays.ONE_WEEK,
        )
        create_index = CustomResource(
            self, "AossVectorIndex",
            service_token=index_provider.service_token,
            properties={
                "Endpoint": self.collection.attr_collection_endpoint,
                "Region": region,
                "IndexName": self.INDEX_NAME,
                "VectorField": self.VECTOR_FIELD,
                "TextField": self.TEXT_FIELD,
                "MetadataField": self.METADATA_FIELD,
                "Dimension": self.EMBED_DIMENSION,
            },
        )
        # The Lambda's data access only takes effect once the access policy is
        # in place, and it needs the collection endpoint.
        create_index.node.add_dependency(self.collection)
        create_index.node.add_dependency(data_access_policy)

        # --- Knowledge Base --------------------------------------------------
        self.knowledge_base = bedrock.CfnKnowledgeBase(
            self, "KnowledgeBase",
            name=f"{prefix}-kb",
            role_arn=kb_role_arn,
            knowledge_base_configuration=bedrock.CfnKnowledgeBase
            .KnowledgeBaseConfigurationProperty(
                type="VECTOR",
                vector_knowledge_base_configuration=bedrock.CfnKnowledgeBase
                .VectorKnowledgeBaseConfigurationProperty(
                    embedding_model_arn=(
                        f"arn:aws:bedrock:{region}::foundation-model/"
                        "amazon.titan-embed-text-v2:0"),
                ),
            ),
            storage_configuration=bedrock.CfnKnowledgeBase
            .StorageConfigurationProperty(
                type="OPENSEARCH_SERVERLESS",
                opensearch_serverless_configuration=bedrock.CfnKnowledgeBase
                .OpenSearchServerlessConfigurationProperty(
                    collection_arn=self.collection.attr_arn,
                    vector_index_name=self.INDEX_NAME,
                    field_mapping=bedrock.CfnKnowledgeBase
                    .OpenSearchServerlessFieldMappingProperty(
                        vector_field=self.VECTOR_FIELD,
                        text_field=self.TEXT_FIELD,
                        metadata_field=self.METADATA_FIELD,
                    ),
                ),
            ),
        )
        # The index must exist before the KB validates its storage config.
        self.knowledge_base.node.add_dependency(create_index)

        # --- Data source: the artifact bucket -------------------------------
        self.data_source = bedrock.CfnDataSource(
            self, "KbDataSource",
            name=f"{prefix}-source",
            knowledge_base_id=self.knowledge_base.attr_knowledge_base_id,
            data_source_configuration=bedrock.CfnDataSource
            .DataSourceConfigurationProperty(
                type="S3",
                s3_configuration=bedrock.CfnDataSource.S3DataSourceConfigurationProperty(
                    bucket_arn=storage.artifacts_bucket.bucket_arn,
                    # The S3 data source allows exactly ONE inclusion prefix
                    # (API: "Fixed number of 1 item"). "input/" holds the
                    # committed legacy source (forms XML + PL/SQL) that the
                    # developer-Q&A RAG use case queries.
                    inclusion_prefixes=["input/"],
                ),
            ),
            vector_ingestion_configuration=bedrock.CfnDataSource
            .VectorIngestionConfigurationProperty(
                chunking_configuration=bedrock.CfnDataSource
                .ChunkingConfigurationProperty(
                    chunking_strategy="FIXED_SIZE",
                    fixed_size_chunking_configuration=bedrock.CfnDataSource
                    .FixedSizeChunkingConfigurationProperty(
                        max_tokens=512, overlap_percentage=10),
                ),
            ),
        )
        # KB role also needs S3 read on the artifact bucket (SSE-KMS, so also
        # kms:Decrypt). Attach as a Policy created HERE rather than
        # bucket.grant_read(role): grant_read mutates the role in its home
        # SecurityStack, pulling the StorageStack bucket ARN into SecurityStack
        # and cycling (StorageStack already depends on SecurityStack's KMS key).
        # This stack already depends on both, so an inline Policy is cycle-free.
        iam.Policy(
            self, "KbBucketReadPolicy",
            roles=[security.bedrock_kb_role],
            statements=[
                iam.PolicyStatement(
                    actions=["s3:GetObject", "s3:ListBucket"],
                    resources=[
                        storage.artifacts_bucket.bucket_arn,
                        f"{storage.artifacts_bucket.bucket_arn}/*",
                    ],
                ),
                iam.PolicyStatement(
                    actions=["kms:Decrypt"],
                    resources=[security.kms_key.key_arn],
                ),
            ],
        )

        self.knowledge_base_id = self.knowledge_base.attr_knowledge_base_id
        self.data_source_id = self.data_source.attr_data_source_id

        CfnOutput(self, "CollectionEndpoint",
                  value=self.collection.attr_collection_endpoint)
        CfnOutput(self, "CollectionArn", value=self.collection.attr_arn)
        CfnOutput(self, "KnowledgeBaseId", value=self.knowledge_base_id)
        CfnOutput(self, "DataSourceId", value=self.data_source_id)
        CfnOutput(self, "VectorIndexName", value=self.INDEX_NAME)
