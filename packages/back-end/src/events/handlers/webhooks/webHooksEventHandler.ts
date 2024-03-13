import { getAllEventWebHooksForEvent } from "@/src/models/EventWebhookModel";
import { NotificationEventHandler } from "@/src/events/notifiers/EventNotifier";
import {
  getFilterDataForNotificationEvent,
  filterEventForEnvironments,
} from "@/src/events/handlers/utils";
import { EventWebHookNotifier } from "./EventWebHookNotifier";

/**
 * Common handler that looks up the web hooks and makes a post request with the event.
 */
export const webHooksEventHandler: NotificationEventHandler = async (event) => {
  const { tags, projects } = getFilterDataForNotificationEvent(event.data) || {
    tags: [],
    projects: [],
  };

  const eventWebHooks = (
    (await getAllEventWebHooksForEvent({
      organizationId: event.organizationId,
      eventName: event.data.event,
      enabled: true,
      tags,
      projects,
    })) || []
  ).filter(({ environments = [] }) =>
    filterEventForEnvironments({ event: event.data, environments })
  );

  eventWebHooks.forEach((eventWebHook) => {
    const notifier = new EventWebHookNotifier({
      eventId: event.id,
      eventWebHookId: eventWebHook.id,
    });
    notifier.enqueue();
  });
};
