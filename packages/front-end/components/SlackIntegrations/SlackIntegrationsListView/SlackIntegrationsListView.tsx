import React, { FC, useCallback, useMemo, useState } from "react";
import pick from "lodash/pick";
import { SlackIntegrationInterface } from "back-end/types/slack-integration";
import { TagInterface } from "back-end/types/tag";
import Link from "next/link";
import {
  SlackIntegrationEditParams,
  SlackIntegrationModalMode,
} from "@/components/SlackIntegrations/slack-integrations-utils";
import { SlackIntegrationsListItem } from "@/components/SlackIntegrations/SlackIntegrationsListView/SlackIntegrationsListItem/SlackIntegrationsListItem";
import { useAuth } from "@/services/auth";
import useApi from "@/hooks/useApi";
import { SlackIntegrationAddEditModal } from "@/components/SlackIntegrations/SlackIntegrationAddEditModal/SlackIntegrationAddEditModal";
import { useEnvironments } from "@/services/features";
import { useDefinitions } from "@/services/DefinitionsContext";

type SlackIntegrationsListViewProps = {
  onEditModalOpen: (id: string, data: SlackIntegrationEditParams) => void;
  onCreateModalOpen: () => void;
  onModalClose: () => void;
  modalMode: SlackIntegrationModalMode | null;
  onCreate: (data: SlackIntegrationEditParams) => void;
  onUpdate: (id: string, data: SlackIntegrationEditParams) => void;
  onDelete: (id: string) => Promise<void>;
  slackIntegrations: SlackIntegrationInterface[];
  modalError: string | null;
  errorMessage: string | null;
  tagOptions: TagInterface[];
  environments: string[];
  projects: {
    id: string;
    name: string;
  }[];
};

export const SlackIntegrationsListView: FC<SlackIntegrationsListViewProps> = ({
  onCreate,
  onUpdate,
  onDelete,
  onEditModalOpen,
  modalMode,
  onModalClose,
  modalError,
  slackIntegrations,
  errorMessage,
  environments,
  tagOptions,
  projects,
}) => {
  const projectsMap: Record<string, string> = useMemo(() => {
    return projects.reduce((acc, curr) => {
      acc[curr.id] = curr.name;
      return acc;
    }, {});
  }, [projects]);

  return (
    <div>
      {/* Add/Edit modal */}
      {modalMode ? (
        <SlackIntegrationAddEditModal
          mode={modalMode}
          isOpen={true}
          onCreate={onCreate}
          onUpdate={onUpdate}
          error={modalError}
          onClose={onModalClose}
          tagOptions={tagOptions}
          projects={projects}
          environments={environments}
        />
      ) : null}

      {/* Heading w/ beta messaging */}
      <div className="mb-4">
        <div className="d-flex justify-space-between align-items-center">
          <h1>Slack Integrations</h1>
        </div>
        <p>Get alerts in Slack when your GrowthBook data is updated.</p>
        <div className="alert alert-warning">
          <h4>Deprecated</h4>
          <p className="mb-0">
            Slack Integrations are deprecated and have been replaced by{" "}
            <Link href="/settings/webhooks">Event Webhooks</Link>, which offer
            the same functionality in a more flexible way.
          </p>
        </div>
      </div>

      {/* Feedback messages */}
      {errorMessage && (
        <div className="alert alert-danger my-3">{errorMessage}</div>
      )}

      {/* Empty state */}
      {slackIntegrations.length === 0 ? null : (
        <div>
          {/* List View */}
          {slackIntegrations.map((slackIntegration) => (
            <div key={slackIntegration.id} className="mb-3">
              <SlackIntegrationsListItem
                onDelete={async () => {
                  await onDelete(slackIntegration.id);
                }}
                projectsMap={projectsMap}
                onEditModalOpen={onEditModalOpen}
                slackIntegration={slackIntegration}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const SlackIntegrationsListViewContainer = () => {
  const { apiCall } = useAuth();

  const [
    modalMode,
    setModalMode,
  ] = useState<SlackIntegrationModalMode | null>();

  const handleOnEditModalOpen = useCallback(
    (id: string, data: SlackIntegrationEditParams) => {
      setModalMode({
        mode: "edit",
        data,
        id,
      });
    },
    []
  );

  const handleOnCreateModalOpen = useCallback(() => {
    setModalMode({
      mode: "create",
    });
  }, []);

  const [addEditError, setAddEditError] = useState<null | string>(null);

  const { data, mutate, error: loadError } = useApi<{
    slackIntegrations: SlackIntegrationInterface[];
  }>("/integrations/slack");

  const errorMessage = loadError?.message || null;

  const slackIntegrations = data?.slackIntegrations || [];

  const handleDelete = useCallback(
    async (id: string) => {
      await apiCall<{
        error?: string;
        slackIntegration?: SlackIntegrationInterface;
      }>(`/integrations/slack/${id}`, {
        method: "DELETE",
      });

      await mutate();
    },
    [apiCall, mutate]
  );

  const handleCreate = useCallback(
    async (data: SlackIntegrationEditParams) => {
      setAddEditError(null);

      try {
        const response = await apiCall<{
          error?: string;
          slackIntegration?: SlackIntegrationInterface;
        }>("/integrations/slack", {
          method: "POST",
          body: JSON.stringify(data),
        });

        if (response.error) {
          setAddEditError(
            `Failed to create Slack integration: ${
              response.error || "Unknown error"
            }`
          );
        } else {
          setAddEditError(null);
          setModalMode(null);
          mutate();
        }
      } catch (e) {
        setAddEditError(`Failed to create Slack integration: ${e.message}`);
      }
    },
    [apiCall, mutate]
  );

  const handleUpdate = useCallback(
    async (id: string, data: SlackIntegrationEditParams) => {
      setAddEditError(null);

      try {
        const response = await apiCall<{
          error?: string;
          slackIntegration?: SlackIntegrationInterface;
        }>(`/integrations/slack/${id}`, {
          method: "PUT",
          body: JSON.stringify(
            pick(data, [
              "name",
              "description",
              "projects",
              "environments",
              "events",
              "tags",
              "slackAppId",
              "slackSigningKey",
              "slackIncomingWebHook",
            ])
          ),
        });

        if (response.error) {
          setAddEditError(
            `Failed to update Slack integration: ${
              response.error || "Unknown error"
            }`
          );
        } else {
          setAddEditError(null);
          setModalMode(null);
          mutate();
        }
      } catch (e) {
        setAddEditError(`Failed to update Slack integration: ${e.message}`);
      }
    },
    [apiCall, mutate]
  );

  const environmentSettings = useEnvironments();
  const environments = environmentSettings.map((env) => env.id);

  const { projects, tags } = useDefinitions();

  return (
    <SlackIntegrationsListView
      slackIntegrations={slackIntegrations}
      // @ts-expect-error TS(2322) If you come across this, please fix it!: Type 'SlackIntegrationModalMode | null | undefined... Remove this comment to see the full error message
      modalMode={modalMode}
      onDelete={handleDelete}
      modalError={addEditError}
      onEditModalOpen={handleOnEditModalOpen}
      onCreateModalOpen={handleOnCreateModalOpen}
      errorMessage={errorMessage}
      environments={environments}
      projects={projects}
      tagOptions={tags}
      onUpdate={handleUpdate}
      onCreate={handleCreate}
      onModalClose={() => setModalMode(null)}
    />
  );
};
