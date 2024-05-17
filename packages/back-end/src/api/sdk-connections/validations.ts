import { getLatestSDKVersion, getSDKCapabilities } from "shared/sdk-versioning";
import { findAllProjectsByOrganization } from "../../models/ProjectModel";
import { ApiReqContext } from "../../../types/api";
import { sdkLanguages } from "../../util/constants";
import { getEnvironments } from "../../services/organizations";

const capabilityParams = [
  ["encryption", "encryptPayload"],
  ["remoteEval", "remoteEvalEnabled"],
] as const;

type CababilitiesParamKey = typeof capabilityParams[number][1];
type CababilitiesParams = { [k in CababilitiesParamKey]?: boolean };

const premiumFeatures = [
  ["encrypt-features-endpoint", "encryptPayload"],
] as const;

type PremiumFeatureKey = typeof premiumFeatures[number][1];
type PremiumFeatures = { [k in PremiumFeatureKey]?: boolean };

export const validatePayload = async (
  context: ApiReqContext,
  {
    name,
    environment,
    sdkVersion: reqSdkVersion,
    language: reqLanguage,
    projects = [],
    encryptPayload = false,
    includeVisualExperiments = false,
    includeDraftExperiments = false,
    includeExperimentNames = false,
    includeRedirectExperiments = false,
    proxyEnabled,
    proxyHost,
    hashSecureAttributes = false,
    ...otherParams
  }: {
    name: string;
    environment: string;
    sdkVersion?: string;
    language?: string;
    projects?: string[];
    encryptPayload?: boolean;
    includeVisualExperiments?: boolean;
    includeDraftExperiments?: boolean;
    includeExperimentNames?: boolean;
    includeRedirectExperiments?: boolean;
    proxyEnabled?: boolean;
    proxyHost?: string;
    hashSecureAttributes?: boolean;
  } & CababilitiesParams &
    PremiumFeatures
) => {
  if (name && name.length < 3) {
    throw Error("Name length must be at least 3 characters");
  }

  if (
    !getEnvironments(context.org)
      .map(({ id }) => id)
      .includes(environment)
  )
    throw new Error(`Environment ${environment} does not exist!`);

  if (projects) {
    const allProjects = await findAllProjectsByOrganization(context);
    const nonexistentProjects = projects.filter(
      (p) => !allProjects.some(({ id }) => p === id)
    );
    if (nonexistentProjects.length)
      throw new Error(
        `The following projects do not exist: ${nonexistentProjects.join(", ")}`
      );
  }

  if (!reqLanguage) throw new Error("SDK connection requires a language!");

  const language = sdkLanguages.find((l) => l === reqLanguage);
  if (!language) throw new Error(`Language ${reqLanguage} is not supported!`);
  const sdkVersion = reqSdkVersion || getLatestSDKVersion(language);

  const capabilities = getSDKCapabilities(language, sdkVersion);

  const payload = {
    name,
    environment,
    sdkVersion,
    languages: [language],
    projects,
    encryptPayload,
    includeVisualExperiments,
    includeDraftExperiments,
    includeExperimentNames,
    includeRedirectExperiments,
    proxyEnabled,
    proxyHost,
    hashSecureAttributes,
    ...otherParams,
  };

  capabilityParams.forEach(([capability, param]) => {
    if (payload[param] && !capabilities.includes(capability))
      throw new Error(
        `SDK version ${sdkVersion} doesn not support ${capability}`
      );
  });

  premiumFeatures.forEach(([feature, param]) => {
    if (payload[param] && !context.hasPremiumFeature(feature))
      throw new Error(`Feature ${feature} requires premium subscription!`);
  });

  return payload;
};
