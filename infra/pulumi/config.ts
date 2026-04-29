import * as pulumi from "@pulumi/pulumi";

interface DomainConfig {
    fqdn: string;
    hostedZoneName: string;
    hostedZoneId: string;
}

interface CrossAccountConfig {
    roleArn: string;
    externalId: string;
    region: string;
}

interface SiteConfig {
    distPath: string;
    bucketName: string;
}

export interface ProjectConfig {
    environment: string;
    projectName: string;
    region: string;
    domain: DomainConfig;
    crossAccount: CrossAccountConfig;
    site: SiteConfig;
}

export function getProjectConfig(): ProjectConfig {
    const config = new pulumi.Config();
    const awsConfig = new pulumi.Config("aws");

    return {
        environment: "prod",
        projectName: "pii-guard",
        region: awsConfig.require("region"),
        domain: config.requireObject<DomainConfig>("domain"),
        crossAccount: config.requireObject<CrossAccountConfig>("crossAccount"),
        site: config.requireObject<SiteConfig>("site"),
    };
}
