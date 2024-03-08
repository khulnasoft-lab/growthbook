import { Response } from "express";
import { AuthRequest } from "../types/AuthRequest";
import { createMetric, refreshMetric } from "../services/experiments";
import { MetricInterface, MetricType } from "../../types/metric";
import {
  getRecentExperimentsUsingMetric,
  getExperimentsByMetric,
} from "../models/ExperimentModel";
import { getContextFromReq } from "../services/organizations";
import {
  deleteMetricById,
  getMetricsByOrganization,
  getMetricById,
  updateMetric,
  getMetricsByDatasource,
} from "../models/MetricModel";
import { IdeaInterface } from "../../types/idea";

import { getDataSourceById } from "../models/DataSourceModel";
import { getIdeasByQuery } from "../services/ideas";
import { ImpactEstimateModel } from "../models/ImpactEstimateModel";
import {
  auditDetailsCreate,
  auditDetailsUpdate,
  auditDetailsDelete,
} from "../services/audit";
import { EventAuditUserForResponseLocals } from "../events/event-types";
import { queueCreateAutoGeneratedMetrics } from "../jobs/createAutoGeneratedMetrics";
import {
  getSourceIntegrationObject,
  getIntegrationFromDatasourceId,
} from "../services/datasource";
import { TrackedEventData } from "../types/Integration";
import { MetricAnalysisQueryRunner } from "../queryRunners/MetricAnalysisQueryRunner";
import { getUserById } from "../services/users";
import { AuditUserLoggedIn } from "../../types/audit";

/**
 * Fields on a metric that we allow users to update. Excluded fields are
 * those that are set by asynchronous analysis jobs that run internally.
 */
export const UPDATEABLE_FIELDS: (keyof MetricInterface)[] = [
  "name",
  "description",
  "owner",
  "segment",
  "type",
  "inverse",
  "ignoreNulls",
  "denominator",
  "cappingSettings",
  "windowSettings",
  "sql",
  "aggregation",
  "queryFormat",
  "status",
  "tags",
  "projects",
  "winRisk",
  "loseRisk",
  "maxPercentChange",
  "minPercentChange",
  "minSampleSize",
  "regressionAdjustmentOverride",
  "regressionAdjustmentEnabled",
  "regressionAdjustmentDays",
  "conditions",
  "dateUpdated",
  "table",
  "column",
  "userIdColumns",
  "userIdTypes",
  "timestampColumn",
  "templateVariables",
];

export async function deleteMetric(
  req: AuthRequest<null, { id: string }>,
  res: Response<unknown, EventAuditUserForResponseLocals>
) {
  const context = getContextFromReq(req);
  const { id } = req.params;

  const metric = await getMetricById(context, id);

  if (!metric) {
    res.status(403).json({
      status: 404,
      message: "Metric not found",
    });
    return;
  }

  req.checkPermissions(
    "createAnalyses",
    metric?.projects?.length ? metric.projects : ""
  );

  req.checkPermissions(
    "createMetrics",
    metric?.projects?.length ? metric.projects : ""
  );

  // now remove the metric itself:
  await deleteMetricById(context, metric);

  await req.audit({
    event: "metric.delete",
    entity: {
      object: "metric",
      id: metric.id,
    },
    details: auditDetailsDelete(metric),
  });

  res.status(200).json({
    status: 200,
  });
}

export async function getMetrics(req: AuthRequest, res: Response) {
  const context = getContextFromReq(req);
  const metrics = await getMetricsByOrganization(context);
  res.status(200).json({
    status: 200,
    metrics,
  });
}

export async function getMetricUsage(
  req: AuthRequest<null, { id: string }>,
  res: Response
) {
  const { id } = req.params;
  const context = getContextFromReq(req);
  const { org } = context;
  const metric = await getMetricById(context, id);

  if (!metric) {
    res.status(403).json({
      status: 404,
      message: "Metric not found",
    });
    return;
  }

  // metrics are used in a few places:

  // Ideas (impact estimate)
  const estimates = await ImpactEstimateModel.find({
    metric: metric.id,
    organization: org.id,
  });
  const ideas: IdeaInterface[] = [];
  if (estimates && estimates.length > 0) {
    await Promise.all(
      estimates.map(async (es) => {
        const idea = await getIdeasByQuery({
          organization: org.id,
          "estimateParams.estimate": es.id,
        });
        if (idea && idea[0]) {
          ideas.push(idea[0]);
        }
      })
    );
  }

  // Experiments
  const experiments = await getExperimentsByMetric(context, metric.id);

  res.status(200).json({
    ideas,
    experiments,
    status: 200,
  });
}

export async function cancelMetricAnalysis(
  req: AuthRequest<null, { id: string }>,
  res: Response
) {
  const context = getContextFromReq(req);
  const { id } = req.params;
  const metric = await getMetricById(context, id, true);
  if (!metric) {
    throw new Error("Could not cancel query");
  }

  req.checkPermissions(
    "runQueries",
    metric.projects?.length ? metric.projects : []
  );

  const integration = await getIntegrationFromDatasourceId(
    context,
    metric.datasource
  );
  const queryRunner = new MetricAnalysisQueryRunner(
    context,
    metric,
    integration
  );
  await queryRunner.cancelQueries();

  res.status(200).json({
    status: 200,
  });
}

export async function postMetricAnalysis(
  req: AuthRequest<null, { id: string }>,
  res: Response
) {
  const context = getContextFromReq(req);
  const { id } = req.params;

  const metric = await getMetricById(context, id, true);

  if (!metric) {
    return res.status(404).json({
      status: 404,
      message: "Metric not found",
    });
  }

  req.checkPermissions(
    "runQueries",
    metric.projects?.length ? metric.projects : []
  );

  try {
    await refreshMetric(
      context,
      metric,
      req.organization?.settings?.metricAnalysisDays
    );

    res.status(200).json({
      status: 200,
    });

    await req.audit({
      event: "metric.analysis",
      entity: {
        object: "metric",
        id: metric.id,
      },
    });
  } catch (e) {
    return res.status(400).json({
      status: 400,
      message: e.message,
    });
  }
}
export async function getMetric(
  req: AuthRequest<null, { id: string }>,
  res: Response
) {
  const context = getContextFromReq(req);
  const { id } = req.params;

  const metric = await getMetricById(context, id, true);

  if (!metric) {
    return res.status(404).json({
      status: 404,
      message: "Metric not found",
    });
  }

  const experiments = await getRecentExperimentsUsingMetric(context, metric.id);

  res.status(200).json({
    status: 200,
    metric,
    experiments,
  });
}

export async function getMetricsFromTrackedEvents(
  req: AuthRequest<{ schema: string }, { datasourceId: string }>,
  res: Response
) {
  const context = getContextFromReq(req);
  const { schema } = req.body;
  const { datasourceId } = req.params;

  const dataSourceObj = await getDataSourceById(context, datasourceId);
  if (!dataSourceObj) {
    res.status(404).json({
      status: 404,
      message: "Invalid data source: " + datasourceId,
    });
    return;
  }

  req.checkPermissions(
    "createMetrics",
    dataSourceObj.projects?.length ? dataSourceObj.projects : ""
  );

  const integration = getSourceIntegrationObject(dataSourceObj);

  try {
    if (
      !integration.getEventsTrackedByDatasource ||
      !integration.settings.schemaFormat ||
      !integration.getSourceProperties().supportsAutoGeneratedMetrics
    ) {
      throw new Error("Datasource does not support auto-metrics");
    }

    const existingMetrics = await getMetricsByDatasource(
      context,
      dataSourceObj.id
    );

    const trackedEvents: TrackedEventData[] = await integration.getEventsTrackedByDatasource(
      integration.settings.schemaFormat,
      existingMetrics,
      schema
    );

    if (!trackedEvents.length) {
      throw new Error(
        "No events found. The query we run to identify tracked events only looks at events from the last 7 days."
      );
    }

    return res.status(200).json({
      status: 200,
      trackedEvents,
    });
  } catch (e) {
    res.status(200).json({
      status: 200,
      trackedEvents: [],
      message: e.message,
    });
    return;
  }
}

export async function postAutoGeneratedMetrics(
  req: AuthRequest<{
    datasourceId: string;
    projects?: string[];
    metricsToCreate?: { name: string; type: MetricType; sql: string }[];
  }>,
  res: Response
) {
  const context = getContextFromReq(req);
  const { org } = context;

  const userId = req.userId;

  if (!userId) {
    res.status(403).json({
      status: 403,
      message: "User not found",
    });
    return;
  }

  const user = await getUserById(userId);

  if (!user) {
    res.status(403).json({
      status: 403,
      message: "User not found",
    });
    return;
  }

  const userObj: AuditUserLoggedIn = {
    id: user.id,
    email: user.email,
    name: user.name || "",
  };

  const { datasourceId, metricsToCreate, projects } = req.body;

  req.checkPermissions("createMetrics", projects?.length ? projects : "");

  const datasourceObj = await getDataSourceById(context, datasourceId);
  if (!datasourceObj) {
    res.status(403).json({
      status: 403,
      message: "Invalid data source: " + datasourceId,
    });
    return;
  }

  if (metricsToCreate?.length) {
    await queueCreateAutoGeneratedMetrics(
      datasourceId,
      org.id,
      metricsToCreate,
      userObj
    );
  }

  res.status(200).json({
    status: 200,
  });
}
export async function postMetrics(
  req: AuthRequest<Partial<MetricInterface>>,
  res: Response
) {
  const context = getContextFromReq(req);
  const { org, userName } = context;

  const {
    name,
    description,
    type,
    table,
    column,
    inverse,
    ignoreNulls,
    denominator,
    cappingSettings,
    windowSettings,
    sql,
    aggregation,
    queryFormat,
    segment,
    tags,
    projects,
    winRisk,
    loseRisk,
    maxPercentChange,
    minPercentChange,
    minSampleSize,
    regressionAdjustmentOverride,
    regressionAdjustmentEnabled,
    regressionAdjustmentDays,
    conditions,
    datasource,
    timestampColumn,
    userIdColumns,
    userIdTypes,
    templateVariables,
  } = req.body;

  req.checkPermissions("createMetrics", projects?.length ? projects : "");

  if (datasource) {
    const datasourceObj = await getDataSourceById(context, datasource);
    if (!datasourceObj) {
      res.status(403).json({
        status: 403,
        message: "Invalid data source: " + datasource,
      });
      return;
    }
  }

  const metric = await createMetric({
    organization: org.id,
    owner: userName,
    datasource,
    name,
    description,
    type,
    segment,
    table,
    column,
    inverse,
    ignoreNulls,
    denominator,
    cappingSettings,
    windowSettings,
    userIdTypes,
    sql,
    aggregation,
    queryFormat,
    status: "active",
    userIdColumns,
    timestampColumn,
    conditions,
    tags,
    projects,
    winRisk,
    loseRisk,
    maxPercentChange,
    minPercentChange,
    minSampleSize,
    regressionAdjustmentOverride,
    regressionAdjustmentEnabled,
    regressionAdjustmentDays,
    templateVariables,
  });

  res.status(200).json({
    status: 200,
    metric,
  });

  await req.audit({
    event: "metric.create",
    entity: {
      object: "metric",
      id: metric.id,
    },
    details: auditDetailsCreate(metric),
  });
}

export async function putMetric(
  req: AuthRequest<Partial<MetricInterface>, { id: string }>,
  res: Response
) {
  const context = getContextFromReq(req);
  const { id } = req.params;
  const metric = await getMetricById(context, id);
  if (!metric) {
    throw new Error("Could not find metric");
  }
  req.checkPermissions(
    "createMetrics",
    metric?.projects?.length ? metric.projects : ""
  );

  const updates: Partial<MetricInterface> = {};

  UPDATEABLE_FIELDS.forEach((k) => {
    if (k in req.body) {
      // eslint-disable-next-line
      (updates as any)[k] = req.body[k];
    }
  });

  if (updates.projects) {
    req.checkPermissions("createMetrics", updates.projects);
  }

  await updateMetric(context, metric, updates);

  res.status(200).json({
    status: 200,
  });

  await req.audit({
    event: "metric.update",
    entity: {
      object: "metric",
      id: metric.id,
    },
    details: auditDetailsUpdate(metric, {
      ...metric,
      ...updates,
    }),
  });
}
