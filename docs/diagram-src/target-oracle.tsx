// Target Architecture — generic "legacy Oracle app → modern Angular + .NET on AWS" sample.
// Modern web app served by CloudFront; Angular SPA from S3; .NET API on ECS Fargate in a VPC;
// Oracle DB retained ("bring-your-own"); Bedrock Knowledge Base for developer Q&A.
// One dominant left-to-right request flow: Users → CDN → ALB → ECS → Oracle.
import { Diagram, Group, VStack, HStack, Node, Arrow } from "./src/engine.tsx";
import { Users, Database } from "./src/icons/resource.js";
import {
  AmazonCloudFront, AmazonSimpleStorageService, ElasticLoadBalancing,
  AmazonElasticContainerService, AmazonElasticContainerRegistry,
  AmazonBedrock, AmazonCloudWatch, AWSSecretsManager, AWSIdentityAndAccessManagement,
} from "./src/icons/service.js";

export default (
  <Diagram title="Target Architecture — Modern Angular + .NET on AWS, Oracle Retained" layout="row" gap={48} align="start">
    {/* Users / browser — outside AWS */}
    <Node id="users" icon={Users} label="Users" sub="browser" />

    <Group kind="aws-cloud" id="aws" label="AWS Cloud" layout="col" gap={40} align="start">
      {/* Top tier: edge services (left) + VPC (right) */}
      <HStack gap={48} align="start">
        {/* Edge / CDN — outside VPC */}
        <VStack gap={24} align="center">
          <Node id="cf"    icon={AmazonCloudFront}             label="Amazon CloudFront"        sub="CDN + /api/* reverse proxy" />
          <Node id="s3spa" icon={AmazonSimpleStorageService}   label="Amazon S3"                sub="Angular SPA (static)" />
        </VStack>

        {/* VPC — ALB in public subnet, ECS + ECR in private subnet */}
        <Group kind="vpc" id="vpc" label="VPC" layout="col" gap={24} align="center">
          <Group kind="public-subnet" label="Public Subnet">
            <Node id="alb" icon={ElasticLoadBalancing}             label="Elastic Load Balancing"           sub="Application Load Balancer" />
          </Group>
          <Group kind="private-subnet" label="Private Subnet">
            <HStack gap={32} align="center">
              <Node id="ecs" icon={AmazonElasticContainerService} label="Amazon ECS"                  sub=".NET API (Fargate)" />
              <Node id="ecr" icon={AmazonElasticContainerRegistry} label="Amazon ECR"                 sub="container image" />
            </HStack>
          </Group>
        </Group>
      </HStack>

      {/* Bottom tier: cross-cutting services */}
      <HStack gap={32} align="center">
        <Node id="bkb" icon={AmazonBedrock}                         label="Amazon Bedrock"                        sub="Knowledge Base · dev Q&A" />
        <Node id="cw"  icon={AmazonCloudWatch}                      label="Amazon CloudWatch"                     sub="logs & metrics" />
        <Node id="sm"  icon={AWSSecretsManager}                     label="AWS Secrets Manager"                   sub="DB credentials" />
        <Node id="iam" icon={AWSIdentityAndAccessManagement}        label="AWS Identity and Access Management"    sub="execution roles" />
      </HStack>
    </Group>

    {/* Retained Oracle — on-prem or bring-your-own */}
    <Group kind="datacenter" id="dc" label="Data Center" layout="col" gap={16} align="center">
      <Node id="oracle" icon={Database} label="Oracle Database" sub="retained · bring-your-own" />
    </Group>

    {/* Dominant request flow: Users → CloudFront → (static: S3, API: ALB) → ECS → Oracle */}
    <Arrow from="users"  to="cf"     fromSide="right" toSide="left" />
    <Arrow from="cf"     to="s3spa"                                  >static</Arrow>
    <Arrow from="cf"     to="alb"    fromSide="right" toSide="left" >/api/*</Arrow>
    <Arrow from="alb"    to="ecs" />
    <Arrow from="ecs"    to="oracle" fromSide="right" toSide="left" >SQL</Arrow>
    {/* ECR → ECS: image pull (dashed, reversed: image flows ECR → ECS) */}
    <Arrow from="ecr"    to="ecs"    dashed                          >pull image</Arrow>
  </Diagram>
);
