import { putVisualChangeValidator } from "@/src/validators/openapi";
import { PutVisualChangeResponse } from "@/types/openapi";
import {
  findExperimentByVisualChangesetId,
  updateVisualChange,
} from "@/src/models/VisualChangesetModel";
import { createApiRequestHandler } from "@/src/util/handler";

export const putVisualChange = createApiRequestHandler(
  putVisualChangeValidator
)(
  async (req): Promise<PutVisualChangeResponse> => {
    const changesetId = req.params.id;
    const visualChangeId = req.params.visualChangeId;
    const orgId = req.organization.id;
    const payload = req.body;

    const experiment = await findExperimentByVisualChangesetId(
      req.context,
      changesetId
    );

    if (!experiment) {
      throw new Error("Experiment not found");
    }

    req.checkPermissions("manageVisualChanges", experiment.project);

    const res = await updateVisualChange({
      changesetId,
      visualChangeId,
      organization: orgId,
      payload,
    });

    return res;
  }
);
