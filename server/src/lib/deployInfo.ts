/** Public deploy metadata (Railway injects RAILWAY_* at runtime). */
export type DeployInfo = {
  sha: string;
  branch?: string;
  environment?: string;
  deploymentId?: string;
  service?: string;
};

export function readDeployInfo(): DeployInfo | null {
  const sha =
    process.env.RAILWAY_GIT_COMMIT_SHA?.trim() ||
    process.env.GIT_SHA?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (!sha) return null;

  const info: DeployInfo = { sha };
  const branch = process.env.RAILWAY_GIT_BRANCH?.trim();
  const environment = process.env.RAILWAY_ENVIRONMENT_NAME?.trim();
  const deploymentId = process.env.RAILWAY_DEPLOYMENT_ID?.trim();
  const service = process.env.RAILWAY_SERVICE_NAME?.trim();
  if (branch) info.branch = branch;
  if (environment) info.environment = environment;
  if (deploymentId) info.deploymentId = deploymentId;
  if (service) info.service = service;
  return info;
}

export function buildHealthPayload(): { ok: true; deploy?: DeployInfo } {
  const deploy = readDeployInfo();
  return deploy ? { ok: true, deploy } : { ok: true };
}
