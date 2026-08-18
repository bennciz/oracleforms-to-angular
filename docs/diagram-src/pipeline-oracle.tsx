// GenAI Migration Pipeline — generic "legacy Oracle → Angular + .NET on AWS" sample.
// Four-stage pipeline orchestrated by AWS Step Functions:
//   1 Parse (Lambda, no AI) → 2 Knowledge Base (Bedrock KB + OpenSearch) →
//   3 Generate (Bedrock / Claude) → 4 Validate (Lambda + pytest)
// One dominant left-to-right flow; detail pushed into the numbered steps legend.
import { Diagram, Group, VStack, Node, Arrow, StepBadge } from "./src/engine.tsx";
import { AmazonSimpleStorageService, AWSLambda, AWSStepFunctions, AmazonBedrock, AmazonOpenSearchService, AmazonCloudWatch, AWSIdentityAndAccessManagement } from "./src/icons/service.js";

const steps = [
  "Stage 1 — PARSE (no AI): A containerized Lambda reads the legacy Oracle artifacts (.fmb Oracle Forms, Oracle APEX exports, DDL). Output is structured JSON — pages, validations, PL/SQL bodies, and a dependency graph. Ground-truth extraction with no AI involvement.",
  "Stage 2 — KNOWLEDGE BASE: Extracted business rules are embedded with Amazon Titan Text Embeddings v2 into a Bedrock Knowledge Base backed by Amazon OpenSearch Serverless (vector store). Enables RAG Q&A over the recovered domain logic.",
  "Stage 3 — GENERATE: Amazon Bedrock (Anthropic Claude) receives the recovered rules, DDL, and dependency context. Generates Angular components, .NET services, OpenAPI specs, and pytest acceptance tests — one file per call, each rule traced into a comment.",
  "Stage 4 — VALIDATE: Lambda runs the generated pytest suite, comparing legacy and modern behaviour. Behavioral equivalence and shadow-mode test results gate promotion to the output bucket.",
  "Artifacts and test reports are written to the S3 output bucket. Amazon CloudWatch captures logs and metrics across all stages; IAM execution roles scope least-privilege access.",
];

export default (
  <Diagram title="GenAI Migration Pipeline — Legacy Oracle to Angular + .NET" layout="row" gap={40} align="center" steps={steps}>
    {/* Source: S3 bucket with legacy Oracle artifacts */}
    <Node id="s3in" icon={AmazonSimpleStorageService} label="Amazon S3" sub="Legacy Oracle artifacts" />

    <Group kind="aws-cloud" id="aws" label="AWS Cloud" layout="col" gap={40} align="start">
      {/* Orchestrator */}
      <Group kind="generic" id="orchestration" label="Pipeline orchestration" layout="row" gap={32}>
        <Node id="sfn" icon={AWSStepFunctions} label="AWS Step Functions" sub="state machine" />
      </Group>

      {/* Four stages in one horizontal row */}
      <Group kind="generic" id="stages" label="Four-stage migration pipeline" layout="row" gap={40} align="start">
        {/* Stage 1 */}
        <Node id="parse" icon={AWSLambda} label="AWS Lambda" sub="1 · Parse (no AI)" />

        {/* Stage 2: KB node above, vector store below */}
        <VStack gap={32} align="center">
          <Node id="kb" icon={AmazonBedrock} label="Amazon Bedrock" sub="2 · Knowledge Bases" />
          <Node id="oss" icon={AmazonOpenSearchService} label="Amazon OpenSearch Service" sub="Serverless · vector store" />
        </VStack>

        {/* Stage 3 */}
        <Node id="generate" icon={AmazonBedrock} label="Amazon Bedrock" sub="3 · Generate (Claude)" />

        {/* Stage 4 */}
        <Node id="validate" icon={AWSLambda} label="AWS Lambda" sub="4 · Validate (pytest)" />
      </Group>

      {/* Observability & access */}
      <Group kind="generic" id="ops" label="Observability & access" layout="row" gap={32}>
        <Node id="cw" icon={AmazonCloudWatch} label="Amazon CloudWatch" sub="logs & metrics" />
        <Node id="iam" icon={AWSIdentityAndAccessManagement} label="AWS Identity and Access Management" sub="execution roles" />
      </Group>
    </Group>

    {/* Output: S3 bucket for artifacts and reports */}
    <Node id="s3out" icon={AmazonSimpleStorageService} label="Amazon S3" sub="Artifacts & reports" />

    {/* Dominant L→R pipeline flow */}
    <Arrow id="a-in"       from="s3in"    to="parse"    fromSide="right" toSide="left" />
    <Arrow id="a-parse-kb" from="parse"   to="kb"       fromSide="right" toSide="left" />
    <Arrow id="a-kb-gen"   from="kb"      to="generate" fromSide="right" toSide="left" />
    <Arrow id="a-gen-val"  from="generate" to="validate" fromSide="right" toSide="left" />
    <Arrow id="a-out"      from="validate" to="s3out"   fromSide="right" toSide="left" />
    {/* OpenSearch feeds the KB node (retrieval) */}
    <Arrow id="a-oss-kb"   from="oss"     to="kb" />
    {/* Step Functions orchestrates all stages — one dashed relationship to the group */}
    <Arrow id="a-orch"     from="sfn"     to="stages"   fromSide="bottom" toSide="top" dashed head="none" />

    <StepBadge n={1} on="a-in"       at="middle" />
    <StepBadge n={2} on="a-parse-kb" at="middle" />
    <StepBadge n={3} on="a-kb-gen"   at="middle" />
    <StepBadge n={4} on="a-gen-val"  at="middle" />
    <StepBadge n={5} on="a-out"      at="middle" />
  </Diagram>
);
