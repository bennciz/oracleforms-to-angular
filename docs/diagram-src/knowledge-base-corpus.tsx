// Knowledge Base Corpus — What Goes Into the RAG Knowledge Base
// Data flow: Stage 1 parsed output → build_corpus.py → Markdown corpus →
//            Amazon S3 → Bedrock Knowledge Bases (Titan Embeddings v2) →
//            Amazon OpenSearch Serverless (vector index) → Developer query → Cited answer
//
// Generic labels only — no customer names.
import { Diagram, Group, HStack, VStack, Node, Arrow, StepBadge, Label } from "/Users/bennciz/.claude/skills/aws-architecture-diagram-svg/src/engine.tsx";
import { Document, Documents, GenericApplication, User } from "/Users/bennciz/.claude/skills/aws-architecture-diagram-svg/src/icons/resource.js";
import { AmazonSimpleStorageService, AmazonBedrock, AmazonOpenSearchService } from "/Users/bennciz/.claude/skills/aws-architecture-diagram-svg/src/icons/service.js";

const steps = [
  "Stage 1 parser emits structured JSON: reconstructed PL/SQL triggers, table dependencies, and form metadata — no AI involved.",
  "build_corpus.py processes the JSON into four Markdown document types ready for embedding.",
  "Corpus Markdown files are uploaded to Amazon S3 as the Bedrock Knowledge Base data source.",
  "Amazon Bedrock Knowledge Bases ingests the S3 corpus; Amazon Titan Text Embeddings v2 creates 1024-dim vectors per chunk.",
  "Vectors are indexed in Amazon OpenSearch Serverless using an HNSW/faiss index — the queryable vector store.",
  "Developer sends a natural-language question via Amazon Bedrock RetrieveAndGenerate; returns a cited answer referencing the source doc.",
];

export default (
  <Diagram title="Knowledge Base Corpus — What Goes In" layout="col" gap={40} steps={steps}>

    {/* ── Row 1 · Build pipeline ── */}
    <HStack gap={24}>

      {/* 1 · Input */}
      <Node id="parsed_output" icon={Documents}
        label={"Stage 1\nParsed Output"}
        sub={"structured JSON\ntriggers · PL/SQL · tables"} />

      {/* 2 · Transform */}
      <Node id="build_corpus" icon={GenericApplication}
        label="build_corpus.py"
        sub="Python script" />

      {/* 3 · Four corpus document types */}
      <Group kind="generic" label="Corpus Documents" id="corpus_docs">
        <VStack gap={16}>
          <Node id="doc_form"   icon={Document}
            label="Per-form docs"
            sub={"triggers · PL/SQL · tables touched"} />
          <Node id="doc_rules"  icon={Document}
            label={"★  business_rules.md"}
            sub={"recovered rules · plain-language intent · PL/SQL"} />
          <Node id="doc_deps"   icon={Document}
            label="dependency_map.md"
            sub={"navigation · data access · FK"} />
          <Node id="doc_schema" icon={Document}
            label="data_schema.md"
            sub={"tables · columns · keys"} />
        </VStack>
      </Group>

      {/* 4 · S3 data source */}
      <Node id="s3" icon={AmazonSimpleStorageService}
        label="Amazon S3"
        sub="KB data source" />

      {/* 5 · Bedrock Knowledge Bases + Titan Embeddings */}
      <Group kind="service-teal" label="Knowledge Bases" icon={AmazonBedrock} id="bedrock_kb">
        <VStack gap={16}>
          <Node id="kb_ingest" icon={AmazonBedrock}
            label="Amazon Bedrock"
            sub="Knowledge Bases — ingest & chunk" />
          <Node id="kb_titan" icon={AmazonBedrock}
            label="Amazon Bedrock"
            sub="Titan Text Embeddings v2 · 1024-dim" />
        </VStack>
      </Group>

      {/* 6 · Vector store */}
      <Node id="opensearch" icon={AmazonOpenSearchService}
        label={"Amazon OpenSearch\nServerless"}
        sub={"vector index\n(HNSW/faiss)"} />

    </HStack>

    {/* ── Row 2 · Query path ── */}
    <HStack gap={40}>
      <Node id="developer"    icon={User}          label="Developer"      sub={"natural-language query"} />
      <Node id="bedrock_rag"  icon={AmazonBedrock} label="Amazon Bedrock" sub="RetrieveAndGenerate" />
      <Node id="cited_answer" icon={Document}      label="Cited Answer"   sub="recovered rule + source citation" />
    </HStack>

    {/* ── Note ── */}
    <Label chip anchor="center">
      {"The KB holds the recovered rules (PL/SQL + intent), NOT the raw Oracle Forms binaries (.fmb)"}
    </Label>

    {/* ── Pipeline arrows ── */}
    <Arrow id="a1" from="parsed_output" to="build_corpus" />
    <Arrow id="a2" from="build_corpus"  to="corpus_docs" />
    <Arrow id="a3" from="corpus_docs"   to="s3" />
    <Arrow id="a4" from="s3"            to="bedrock_kb" />
    <Arrow id="a5" from="bedrock_kb"    to="opensearch" />

    {/* ── Query arrows ── */}
    <Arrow id="a6" from="developer"   to="bedrock_rag" />
    <Arrow id="a7" from="bedrock_rag" to="cited_answer" />

    {/* ── Cross-tier: OpenSearch → Bedrock RAG (retrieval at query time) ── */}
    <Arrow id="a8" from="opensearch" to="bedrock_rag" fromSide="bottom" toSide="top" />

    {/* ── Step badges ── */}
    <StepBadge n={1} near="parsed_output" />
    <StepBadge n={2} on="a2" at="middle" />
    <StepBadge n={3} on="a3" at="middle" />
    <StepBadge n={4} near="s3" />
    <StepBadge n={5} on="a5" at="middle" />
    <StepBadge n={6} near="developer" />

  </Diagram>
);
