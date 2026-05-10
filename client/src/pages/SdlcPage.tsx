import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { applyWorkspacePrefixToApiPath } from "../lib/workspaceApiRouting";
import type {
  Initiative,
  RepositoryConnection,
  Release,
  SecurityTopic,
  UseCase,
  VcsProvider,
  SecurityTopicCategory,
  Requirement
} from "../types/models";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input, Select } from "../components/ui/Field";

type Props = {
  isAdmin: boolean;
  initiatives: Initiative[];
};

function flattenRequirements(initiatives: Initiative[]): Requirement[] {
  const out: Requirement[] = [];
  for (const i of initiatives) {
    for (const f of i.features ?? []) {
      for (const r of f.requirements ?? []) out.push(r);
    }
  }
  return out;
}

export function SdlcPage({ isAdmin, initiatives }: Props) {
  const { t } = useTranslation();
  const [repos, setRepos] = useState<RepositoryConnection[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [useCases, setUseCases] = useState<UseCase[]>([]);
  const [securityTopics, setSecurityTopics] = useState<SecurityTopic[]>([]);
  const [loading, setLoading] = useState(true);

  const requirements = useMemo(() => flattenRequirements(initiatives), [initiatives]);

  const [newRepoProvider, setNewRepoProvider] = useState<VcsProvider>("GITHUB");
  const [newRepoOwner, setNewRepoOwner] = useState("");
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoDisplay, setNewRepoDisplay] = useState("");

  const [relTag, setRelTag] = useState("");
  const [relName, setRelName] = useState("");
  const [relReqId, setRelReqId] = useState("");
  const [relConnId, setRelConnId] = useState<string>("");

  const [ucTitle, setUcTitle] = useState("");
  const [ucActor, setUcActor] = useState("");

  const [stTitle, setStTitle] = useState("");
  const [stCat, setStCat] = useState<SecurityTopicCategory>("AUTHN");

  async function refresh() {
    setLoading(true);
    try {
      const [r, rel, uc, st] = await Promise.all([
        api.getRepositoryConnections(),
        api.getReleases(),
        api.getUseCases(),
        api.getSecurityTopics()
      ]);
      setRepos(r.repositoryConnections);
      setReleases(rel.releases);
      setUseCases(uc.useCases);
      setSecurityTopics(st.securityTopics);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{t("sdlcPage.title")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("sdlcPage.intro")}</p>
      </div>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">{t("sdlcPage.repositories")}</h2>
        <p className="mb-3 text-xs text-slate-500">{t("sdlcPage.repositoriesHint")}</p>
        {loading ? <p className="text-sm text-slate-500">{t("common.loading")}</p> : null}
        <ul className="mb-4 space-y-3 text-sm">
          {repos.map((c) => {
            const ghPath = `/api/vcs/webhooks/github/${c.id}`;
            const glPath = `/api/vcs/webhooks/gitlab/${c.id}`;
            const oauthGithub = applyWorkspacePrefixToApiPath(
              `/api/vcs/oauth/github/start?connectionId=${encodeURIComponent(c.id)}`
            );
            const oauthGitlab = applyWorkspacePrefixToApiPath(
              `/api/vcs/oauth/gitlab/start?connectionId=${encodeURIComponent(c.id)}`
            );
            return (
              <li key={c.id} className="rounded border border-slate-200 bg-slate-50/80 p-3">
                <div className="font-medium text-slate-800">
                  {c.displayName?.trim() || `${c.owner}/${c.repo}`}{" "}
                  <span className="text-xs font-normal text-slate-500">({c.provider})</span>
                </div>
                <div className="mt-1 font-mono text-xs text-slate-600">
                  {c.provider === "GITHUB" ? ghPath : glPath}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {c.provider === "GITHUB" ? (
                    <a className="text-xs text-sky-600 hover:underline" href={oauthGithub}>
                      {t("sdlcPage.connectGithub")}
                    </a>
                  ) : (
                    <a className="text-xs text-sky-600 hover:underline" href={oauthGitlab}>
                      {t("sdlcPage.connectGitlab")}
                    </a>
                  )}
                  {isAdmin ? (
                    <Button
                      variant="ghost"
                      className="h-7 px-2 text-xs text-red-600"
                      onClick={async () => {
                        if (!window.confirm(t("sdlcPage.confirmDeleteRepo"))) return;
                        await api.deleteRepositoryConnection(c.id);
                        await refresh();
                      }}
                    >
                      {t("common.delete")}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        {isAdmin ? (
          <div className="grid gap-2 border-t border-slate-200 pt-3 md:grid-cols-5">
            <Select value={newRepoProvider} onChange={(e) => setNewRepoProvider(e.target.value as VcsProvider)}>
              <option value="GITHUB">GitHub</option>
              <option value="GITLAB">GitLab</option>
            </Select>
            <Input value={newRepoOwner} onChange={(e) => setNewRepoOwner(e.target.value)} placeholder="owner" />
            <Input value={newRepoName} onChange={(e) => setNewRepoName(e.target.value)} placeholder="repo" />
            <Input
              value={newRepoDisplay}
              onChange={(e) => setNewRepoDisplay(e.target.value)}
              placeholder={t("sdlcPage.displayNameOptional")}
            />
            <Button
              onClick={async () => {
                if (!newRepoOwner.trim() || !newRepoName.trim()) return;
                await api.upsertRepositoryConnection({
                  provider: newRepoProvider,
                  owner: newRepoOwner.trim(),
                  repo: newRepoName.trim(),
                  displayName: newRepoDisplay.trim() || null
                });
                setNewRepoOwner("");
                setNewRepoName("");
                setNewRepoDisplay("");
                await refresh();
              }}
            >
              {t("sdlcPage.addRepository")}
            </Button>
          </div>
        ) : null}
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">{t("sdlcPage.releases")}</h2>
        <ul className="mb-3 max-h-48 space-y-1 overflow-auto text-sm text-slate-700">
          {releases.map((r) => (
            <li key={r.id}>
              <span className="font-mono text-xs">{r.tag}</span> — {r.name}
            </li>
          ))}
        </ul>
        {isAdmin ? (
          <div className="grid gap-2 border-t border-slate-200 pt-3 md:grid-cols-6">
            <Input value={relTag} onChange={(e) => setRelTag(e.target.value)} placeholder="tag e.g. v1.2.0" />
            <Input value={relName} onChange={(e) => setRelName(e.target.value)} placeholder={t("sdlcPage.releaseName")} />
            <Select value={relConnId} onChange={(e) => setRelConnId(e.target.value)}>
              <option value="">{t("sdlcPage.noRepository")}</option>
              {repos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.owner}/{c.repo}
                </option>
              ))}
            </Select>
            <Select value={relReqId} onChange={(e) => setRelReqId(e.target.value)}>
              <option value="">{t("sdlcPage.optionalRequirement")}</option>
              {requirements.map((req) => (
                <option key={req.id} value={req.id}>
                  {req.title}
                </option>
              ))}
            </Select>
            <Button
              className="md:col-span-2"
              onClick={async () => {
                if (!relTag.trim() || !relName.trim()) return;
                await api.createRelease({
                  tag: relTag.trim(),
                  name: relName.trim(),
                  repositoryConnectionId: relConnId || null,
                  requirementIds: relReqId ? [relReqId] : undefined,
                  source: "MANUAL"
                });
                setRelTag("");
                setRelName("");
                setRelReqId("");
                await refresh();
              }}
            >
              {t("sdlcPage.createRelease")}
            </Button>
          </div>
        ) : null}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">{t("sdlcPage.useCases")}</h2>
          <ul className="mb-3 max-h-40 space-y-1 overflow-auto text-sm">
            {useCases.map((u) => (
              <li key={u.id}>{u.title}</li>
            ))}
          </ul>
          {isAdmin ? (
            <div className="grid gap-2 border-t border-slate-200 pt-3">
              <Input value={ucTitle} onChange={(e) => setUcTitle(e.target.value)} placeholder={t("sdlcPage.useCaseTitle")} />
              <Input value={ucActor} onChange={(e) => setUcActor(e.target.value)} placeholder={t("sdlcPage.primaryActor")} />
              <Button
                onClick={async () => {
                  if (!ucTitle.trim()) return;
                  await api.createUseCase({ title: ucTitle.trim(), primaryActor: ucActor.trim() || null });
                  setUcTitle("");
                  setUcActor("");
                  await refresh();
                }}
              >
                {t("sdlcPage.addUseCase")}
              </Button>
            </div>
          ) : null}
        </Card>

        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">{t("sdlcPage.securityTopics")}</h2>
          <ul className="mb-3 max-h-40 space-y-1 overflow-auto text-sm">
            {securityTopics.map((s) => (
              <li key={s.id}>
                [{s.category}] {s.title}
              </li>
            ))}
          </ul>
          {isAdmin ? (
            <div className="grid gap-2 border-t border-slate-200 pt-3">
              <Input value={stTitle} onChange={(e) => setStTitle(e.target.value)} placeholder={t("sdlcPage.securityTitle")} />
              <Select value={stCat} onChange={(e) => setStCat(e.target.value as SecurityTopicCategory)}>
                <option value="AUTHN">AUTHN</option>
                <option value="AUTHZ">AUTHZ</option>
                <option value="DATA">DATA</option>
                <option value="SUPPLY_CHAIN">SUPPLY_CHAIN</option>
                <option value="OPS">OPS</option>
              </Select>
              <Button
                onClick={async () => {
                  if (!stTitle.trim()) return;
                  await api.createSecurityTopic({ title: stTitle.trim(), category: stCat });
                  setStTitle("");
                  await refresh();
                }}
              >
                {t("sdlcPage.addSecurityTopic")}
              </Button>
            </div>
          ) : null}
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-800">{t("sdlcPage.detailLinksHintTitle")}</h2>
        <p className="text-sm text-slate-600">{t("sdlcPage.detailLinksHintBody")}</p>
      </Card>
    </div>
  );
}
