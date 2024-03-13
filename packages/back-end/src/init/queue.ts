import { getAgendaInstance } from "@/src/services/queueing";
import { CRON_ENABLED } from "@/src/util/secrets";
import addExperimentResultsJob from "@/src/jobs/updateExperimentResults";
import refreshFactTableColumns from "@/src/jobs/refreshFactTableColumns";
import updateScheduledFeatures from "@/src/jobs/updateScheduledFeatures";
import addWebhooksJob from "@/src/jobs/webhooks";
import addMetricUpdateJob from "@/src/jobs/updateMetrics";
import addProxyUpdateJob from "@/src/jobs/proxyUpdate";
import createInformationSchemaJob from "@/src/jobs/createInformationSchema";
import updateInformationSchemaJob from "@/src/jobs/updateInformationSchema";
import createAutoGeneratedMetrics from "@/src/jobs/createAutoGeneratedMetrics";
import updateStaleInformationSchemaTable from "@/src/jobs/updateStaleInformationSchemaTable";
import expireOldQueries from "@/src/jobs/expireOldQueries";
import addSdkWebhooksJob from "@/src/jobs/sdkWebhooks";

export async function queueInit() {
  if (!CRON_ENABLED) return;
  const agenda = getAgendaInstance();

  addExperimentResultsJob(agenda);
  updateScheduledFeatures(agenda);
  addMetricUpdateJob(agenda);
  addWebhooksJob(agenda);
  addProxyUpdateJob(agenda);
  createInformationSchemaJob(agenda);
  updateInformationSchemaJob(agenda);
  createAutoGeneratedMetrics(agenda);
  updateStaleInformationSchemaTable(agenda);
  expireOldQueries(agenda);
  refreshFactTableColumns(agenda);
  addSdkWebhooksJob(agenda);

  await agenda.start();
}
