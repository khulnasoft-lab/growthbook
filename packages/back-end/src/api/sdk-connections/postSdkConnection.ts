import { PostSdkConnectionResponse } from "../../../types/openapi";
import {
  toApiSDKConnectionInterface,
  createSDKConnection,
} from "../../models/SdkConnectionModel";
import { createApiRequestHandler } from "../../util/handler";
import { postSdkConnectionValidator } from "../../validators/openapi";
import { validatePayload } from "./validations";

export const postSdkConnection = createApiRequestHandler(
  postSdkConnectionValidator
)(
  async (req): Promise<PostSdkConnectionResponse> => {
    const params = {
      ...(await validatePayload(req.context, req.body)),
      organization: req.context.org.id,
    };

    if (!req.context.permissions.canCreateSDKConnection(params))
      req.context.permissions.throwPermissionError();

    return {
      sdkConnection: toApiSDKConnectionInterface(
        await createSDKConnection(params)
      ),
    };
  }
);
