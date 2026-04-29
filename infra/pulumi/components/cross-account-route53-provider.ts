import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export interface CrossAccountRoute53ProviderArgs {
    roleArn: string;
    externalId: string;
    region: string;
}

export class CrossAccountRoute53Provider extends pulumi.ComponentResource {
    private readonly _provider: aws.Provider;

    constructor(name: string, args: CrossAccountRoute53ProviderArgs, opts?: pulumi.ComponentResourceOptions) {
        super("pii-guard:infra:CrossAccountRoute53Provider", name, {}, opts);

        this._provider = new aws.Provider(`${name}-provider`, {
            region: args.region as aws.Region,
            assumeRoles: [{
                roleArn: args.roleArn,
                externalId: args.externalId,
            }],
        }, { parent: this });

        this.registerOutputs({});
    }

    public getProvider(): aws.Provider {
        return this._provider;
    }
}
