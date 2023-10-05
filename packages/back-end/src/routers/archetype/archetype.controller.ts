import type { Response } from "express";
import { orgHasPremiumFeature } from "enterprise";
import { AuthRequest } from "../../types/AuthRequest";
import { ApiErrorResponse, PrivateApiErrorResponse } from "../../../types/api";
import { getOrgFromReq } from "../../services/organizations";
import {
  ArchetypeAttributeValues,
  ArchetypeInterface,
} from "../../../types/archetype";
import {
  createArchetype,
  deleteArchetypeById,
  getAllArchetypes,
  getArchetypeById,
  updateArchetypeById,
} from "../../models/ArchetypeModel";
import {
  auditDetailsCreate,
  auditDetailsDelete,
  auditDetailsUpdate,
} from "../../services/audit";
import { FeatureTestResult } from "../../../types/feature";
import { evaluateFeature } from "../../services/features";
import { getFeature } from "../../models/FeatureModel";
import { promiseAllChunks } from "../../util/promise";

// region GET /sample-users

type GetArchetypeResponse = {
  status: 200;
  archetype: ArchetypeInterface[];
};

/**
 * GET /sample-users
 * Create a sample user
 * @param req
 * @param res
 */
export const getArchetype = async (
  req: AuthRequest,
  res: Response<GetArchetypeResponse>
) => {
  const { org, userId } = getOrgFromReq(req);

  req.checkPermissions("manageArchetype");

  const archetype = await getAllArchetypes(org.id, userId);

  return res.status(200).json({
    status: 200,
    archetype,
  });
};

// endregion GET /sample-users

// region GET /sample-users/eval/:id

type GetArchetypeAndEvalResponse = {
  status: 200;
  archetype: ArchetypeInterface[];
  featureResults:
    | { [key: string]: FeatureTestResult[] }
    | Record<string, never>;
};

/**
 * GET /sample-users/eval/:id
 * Get sample users and eval for a given feature
 * @param req
 * @param res
 */
export const getArchetypeAndEval = async (
  req: AuthRequest<null, { id: string }>,
  res: Response<GetArchetypeAndEvalResponse | PrivateApiErrorResponse>
) => {
  const { org, userId } = getOrgFromReq(req);
  const { id } = req.params;
  const feature = await getFeature(org.id, id);

  if (!feature) {
    throw new Error("Feature not found");
  }

  if (!orgHasPremiumFeature(org, "archetypes")) {
    return res.status(403).json({
      status: 403,
      message: "Organization does not have premium feature: sample users",
    });
  }

  req.checkPermissions("manageArchetype");

  const archetype = await getAllArchetypes(org.id, userId);
  const featureResults: { [key: string]: FeatureTestResult[] } = {};

  if (archetype.length) {
    const promiseCallbacks: (() => Promise<unknown>)[] = [];
    archetype.forEach((arch) => {
      try {
        const attrs = JSON.parse(arch.attributes) as ArchetypeAttributeValues;
        promiseCallbacks.push(async () => {
          const result = await evaluateFeature(feature, attrs, org);
          if (!result) return;
          featureResults[arch.id] = result;
        });
      } catch (e) {
        // not sure what we should do with a json error - should be impossible to get here.
      }
    });
    await promiseAllChunks(promiseCallbacks, 5);
  }

  return res.status(200).json({
    status: 200,
    archetype,
    featureResults,
  });
};
// endregion GET /sample-users/eval/:id

// region POST /sample-users

type CreateArchetypeRequest = AuthRequest<{
  name: string;
  description: string;
  owner: string;
  isPublic: boolean;
  attributes: string;
}>;

type CreateArchetypeResponse = {
  status: 200;
  archetype: ArchetypeInterface;
};

/**
 * POST /sample-users
 * Create a sample user
 * @param req
 * @param res
 */
export const postArchetype = async (
  req: CreateArchetypeRequest,
  res: Response<CreateArchetypeResponse | PrivateApiErrorResponse>
) => {
  const { org, userId } = getOrgFromReq(req);
  const { name, attributes, description, isPublic } = req.body;

  if (!orgHasPremiumFeature(org, "archetypes")) {
    return res.status(403).json({
      status: 403,
      message: "Organization does not have premium feature: sample users",
    });
  }

  req.checkPermissions("manageArchetype");

  const archetype = await createArchetype({
    attributes,
    name,
    description,
    owner: userId,
    isPublic,
    organization: org.id,
  });

  await req.audit({
    event: "archetype.created",
    entity: {
      object: "archetype",
      id: archetype.id,
      name,
    },
    details: auditDetailsCreate(archetype),
  });

  return res.status(200).json({
    status: 200,
    archetype,
  });
};

// endregion POST /sample-users

// region PUT /sample-users/:id

type PutArchetypeRequest = AuthRequest<
  {
    name: string;
    description: string;
    owner: string;
    attributes: string;
    isPublic: boolean;
  },
  { id: string }
>;

type PutArchetypeResponse = {
  status: 200;
};

/**
 * PUT /sample-users/:id
 * Update one sample user
 * @param req
 * @param res
 */
export const putArchetype = async (
  req: PutArchetypeRequest,
  res: Response<
    PutArchetypeResponse | ApiErrorResponse | PrivateApiErrorResponse
  >
) => {
  const { org } = getOrgFromReq(req);
  const { name, description, isPublic, owner, attributes } = req.body;
  const { id } = req.params;

  if (!id) {
    throw new Error("Must specify sample user id");
  }

  if (!orgHasPremiumFeature(org, "archetypes")) {
    return res.status(403).json({
      status: 403,
      message: "Organization does not have premium feature: sample users",
    });
  }

  req.checkPermissions("manageArchetype");

  const archetype = await getArchetypeById(id, org.id);

  if (!archetype) {
    throw new Error("Could not find sample user");
  }

  const changes = await updateArchetypeById(id, org.id, {
    attributes,
    name,
    description,
    isPublic,
    owner,
  });

  const updatedArchetype = { ...archetype, ...changes };

  await req.audit({
    event: "archetype.updated",
    entity: {
      object: "archetype",
      id: updatedArchetype.id,
      name: name,
    },
    details: auditDetailsUpdate(archetype, updatedArchetype),
  });

  return res.status(200).json({
    status: 200,
  });
};

// endregion PUT /sample-users/:id

// region DELETE /sample-users/:id

type DeleteArchetypeRequest = AuthRequest<
  Record<string, never>,
  { id: string },
  Record<string, never>
>;

type DeleteArchetypeResponse =
  | {
      status: 200;
    }
  | {
      status: number;
      message: string;
    };

/**
 * DELETE /sample-users/:id
 * Delete one sample-users resource by ID
 * @param req
 * @param res
 */
export const deleteArchetype = async (
  req: DeleteArchetypeRequest,
  res: Response<DeleteArchetypeResponse>
) => {
  req.checkPermissions("manageArchetype");

  const { id } = req.params;
  const { org } = getOrgFromReq(req);

  const archetype = await getArchetypeById(id, org.id);

  if (!archetype) {
    res.status(403).json({
      status: 404,
      message: "Sample user not found",
    });
    return;
  }

  if (archetype.organization !== org.id) {
    res.status(403).json({
      status: 403,
      message: "You do not have access to this sample user",
    });
    return;
  }

  await deleteArchetypeById(id, org.id);

  await req.audit({
    event: "archetype.deleted",
    entity: {
      object: "archetype",
      id: id,
      name: archetype.name,
    },
    details: auditDetailsDelete(archetype),
  });

  res.status(200).json({
    status: 200,
  });
};

// endregion DELETE /sample-users/:id
