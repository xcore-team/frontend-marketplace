import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Rocket, Server, ExternalLink,
  KeyRound, Plus, Trash2, FileSignature, Loader2, Folder,
  Package, Activity, Boxes, Search, Tag, X, Pencil, HardDrive, User,
} from 'lucide-react'
import { deployments as deploymentsApi, devkeys as devkeysApi, github as githubApi, plugins as pluginsApi, services as servicesApi, xdeployArtifacts as xdeployArtifactsApi } from '../../api'
import { useAuthStore } from '../../stores/auth'
import { useToast } from '../../components/Toast'
import { PageLoading } from '../../components/Skeleton'
import { Tabs, Panel, Pill, StatusIcon, RelativeTime, RevealedKeyBanner, Modal } from '../../components/ui'
import type { TabItem } from '../../components/ui'
import type { ApiKey, ApiKeyCreated, Deployment, GHTag, Manifest, ManifestItem, Plugin, Project, ServiceSummary, SigningKey, XDeployArtifact } from '../../types'
import { parseGithubRepo } from '../../utils/github'

const STATUS_LABEL: Record<string, string> = { running: 'En cours', succeeded: 'Réussi', failed: 'Échoué', pending: 'En attente' }
const STATUS_FILTERS = [
  { value: '', label: 'Tous' },
  { value: 'pending', label: 'En attente' },
  { value: 'running', label: 'En cours' },
  { value: 'succeeded', label: 'Réussi' },
  { value: 'failed', label: 'Échoué' },
]
const KIND_LABEL: Record<string, string> = { plugin: 'Plugin', service: 'Service', xdeploy: 'Bundle' }

function FleetRow({ kind, slug, count, latest }: { kind: string; slug: string; count: number; latest: Deployment }) {
  const [open, setOpen] = useState(false)
  const { data: hosts, isLoading } = useQuery<Deployment[]>({
    queryKey: ['deployment-hosts', kind, slug],
    queryFn: () => deploymentsApi.hosts(kind, slug),
    enabled: open,
  })

  return (
    <div className="panel" style={{ overflow: 'hidden' }}>
      <div className="list-row" style={{ border: 'none' }} onClick={() => setOpen((v) => !v)}>
        {kind === 'service' ? <Server size={16} style={{ color: 'var(--text3)' }} /> : <Package size={16} style={{ color: 'var(--text3)' }} />}
        <div className="list-row__main">
          <div className="list-row__title" style={{ color: 'var(--text)' }}>
            {slug}
            <Pill>{KIND_LABEL[kind] ?? kind}</Pill>
            <Pill variant={latest.status === 'succeeded' ? 'success' : latest.status === 'failed' ? 'danger' : 'warning'} icon={<StatusIcon status={latest.status} size={11} />}>
              {STATUS_LABEL[latest.status] ?? latest.status}
            </Pill>
          </div>
          <div className="list-row__meta">
            <span>{count} déploiement{count > 1 ? 's' : ''}</span>
            <span>dernier <RelativeTime date={latest.created_at} /></span>
          </div>
        </div>
        <div className="list-row__side">
          <span className="ledger-id">v{latest.version}</span>
        </div>
      </div>
      {open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 16px 14px' }}>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted text-sm"><div className="spinner" /> Chargement des hôtes…</div>
          ) : (hosts ?? []).length === 0 ? (
            <div className="text-xs text-faint">Aucun hôte actif.</div>
          ) : (
            <div className="list" style={{ marginTop: 4 }}>
              {(hosts ?? []).map((h) => (
                <div key={h.id} className="list-row" style={{ cursor: 'default', padding: '8px 12px' }}>
                  <StatusIcon status={h.status} size={13} />
                  <div className="list-row__main">
                    <span className="ledger-id">{h.host_id}</span>
                  </div>
                  <div className="list-row__side">
                    <span className="ledger-id">v{h.version}</span>
                    <span className="text-xs text-faint"><RelativeTime date={h.completed_at ?? h.created_at} /></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Projets & clés API (xdevkeys) ───────────────────────────────────────────

function ManifestItemPicker({ onAdd }: { onAdd: (item: ManifestItem) => void }) {
  const [kind, setKind] = useState<'plugin' | 'service'>('plugin')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<{ slug: string; name: string; latestVersion?: string | null } | null>(null)
  const [version, setVersion] = useState('')

  const { data: items = [], isFetching } = useQuery<(Plugin | ServiceSummary)[]>({
    queryKey: ['manifest-picker', kind, search],
    queryFn: async () => {
      if (kind === 'plugin') {
        const res = await pluginsApi.list({ search, limit: 8 })
        return res.items
      }
      return servicesApi.list({ search, limit: 8 })
    },
    enabled: search.trim().length >= 2 && !selected,
  })

  // Détail complet (repository) une fois un composant sélectionné — la
  // recherche ne renvoie que le résumé, sans le lien du repo.
  const { data: detail } = useQuery<Plugin | (ServiceSummary & { repository?: string | null })>({
    queryKey: ['manifest-picker-detail', kind, selected?.slug],
    queryFn: () => (kind === 'plugin' ? pluginsApi.get(selected!.slug) : servicesApi.get(selected!.slug)),
    enabled: !!selected,
  })

  const repo = parseGithubRepo((detail as any)?.repository)
  const { data: tags, isLoading: tagsLoading } = useQuery<GHTag[]>({
    queryKey: ['manifest-picker-tags', repo?.owner, repo?.repo],
    queryFn: () => githubApi.tags(repo!.owner, repo!.repo),
    enabled: !!repo,
    retry: false,
  })

  const select = (item: Plugin | ServiceSummary) => {
    setSelected({ slug: item.slug, name: item.name, latestVersion: item.latest_version })
    setVersion(item.latest_version ?? '')
    setSearch('')
  }

  const cancel = () => { setSelected(null); setVersion('') }

  const confirmAdd = () => {
    onAdd({ kind, slug: selected!.slug, version: version.trim() || null })
    cancel()
  }

  if (selected) {
    return (
      <div className="panel panel--muted" style={{ padding: 12 }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold">{selected.name}</span>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={cancel}><X size={12} /></button>
        </div>
        <div className="input-wrap mb-3">
          <label className="input-label">Version</label>
          {repo ? (
            tagsLoading ? (
              <div className="text-xs text-faint flex items-center gap-1" style={{ padding: '6px 0' }}><Loader2 size={11} className="spin" /> Chargement des tags Git ({repo.owner}/{repo.repo})…</div>
            ) : (tags?.length ?? 0) > 0 ? (
              <select className="select" value={version} onChange={(e) => setVersion(e.target.value)}>
                <option value="">Choisir un tag…</option>
                {tags!.map((t) => <option key={t.name} value={t.name.replace(/^v/, '')}>{t.name}</option>)}
              </select>
            ) : (
              <input className="input" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="Ex: 1.0.0" />
            )
          ) : (
            <input className="input" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="Ex: 1.0.0" />
          )}
          {!repo && <p className="text-xs text-faint mt-1">Pas de dépôt GitHub lié — version saisie à la main.</p>}
        </div>
        <button className="btn btn-primary btn-sm" onClick={confirmAdd}><Plus size={13} /> Ajouter au manifeste</button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <select className="select" style={{ width: 'auto' }} value={kind} onChange={(e) => { setKind(e.target.value as 'plugin' | 'service'); setSearch('') }}>
          <option value="plugin">Plugin</option>
          <option value="service">Service</option>
        </select>
        <div className="search-bar" style={{ flex: 1 }}>
          <Search size={14} style={{ color: 'var(--text3)' }} />
          <input placeholder={`Rechercher un ${kind === 'plugin' ? 'plugin' : 'service'}…`} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      {search.trim().length >= 2 && (
        <div className="list" style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)' }}>
          {isFetching ? (
            <div className="text-xs text-faint" style={{ padding: 10 }}>Recherche…</div>
          ) : items.length === 0 ? (
            <div className="text-xs text-faint" style={{ padding: 10 }}>Aucun résultat.</div>
          ) : items.map((item) => (
            <div key={item.id} className="list-row" style={{ padding: '8px 12px' }} onClick={() => select(item)}>
              <div className="list-row__main"><div className="list-row__title" style={{ color: 'var(--text)', fontSize: 13 }}>{item.name}</div></div>
              <div className="list-row__side"><Plus size={13} style={{ color: 'var(--acc)' }} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ManifestSection({ project }: { project: Project }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [tag, setTag] = useState('')
  const [draftItems, setDraftItems] = useState<ManifestItem[]>([])

  const { data: manifests, isLoading } = useQuery<Manifest[]>({
    queryKey: ['project-manifests', project.id],
    queryFn: () => devkeysApi.projects.manifests.list(project.id),
  })

  const latest = (manifests ?? [])[0]

  const createMutation = useMutation({
    mutationFn: () => devkeysApi.projects.manifests.create(project.id, { tag: tag.trim(), items: draftItems }),
    onSuccess: () => {
      toast(`Manifeste « ${tag} » enregistré.`, 'success')
      setEditing(false); setTag('')
      queryClient.invalidateQueries({ queryKey: ['project-manifests', project.id] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const startEdit = () => {
    setDraftItems(latest ? latest.items.map((i) => ({ ...i })) : [])
    setTag('')
    setEditing(true)
  }

  const removeItem = (idx: number) => setDraftItems((cur) => cur.filter((_, i) => i !== idx))

  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px' }}>
      <div className="flex items-center justify-between mb-3" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="flex items-center gap-2">
          <Boxes size={14} style={{ color: 'var(--text3)' }} />
          <span className="text-xs font-bold" style={{ color: 'var(--text2)' }}>Manifeste — plugins &amp; services à installer</span>
          {latest && <Pill>{latest.tag}</Pill>}
        </div>
        {!editing && <button className="btn btn-ghost btn-sm" onClick={startEdit}><Pencil size={12} /> {latest ? 'Éditer' : 'Créer'}</button>}
      </div>

      {isLoading ? (
        <div className="text-xs text-faint">Chargement…</div>
      ) : !editing ? (
        !latest || latest.items.length === 0 ? (
          <div className="text-xs text-faint">Aucun manifeste pour l'instant — le contenu réel de l'artefact scellé reste géré par xcore-agent, ceci n'est qu'un plan de référence.</div>
        ) : (
          <div className="list" style={{ border: 'none' }}>
            {latest.items.map((item, i) => (
              <div key={i} className="list-row" style={{ padding: '6px 0' }} onClick={() => navigate(`/${item.kind === 'plugin' ? 'plugins' : 'services'}/${item.slug}`)}>
                {item.kind === 'service' ? <Server size={13} style={{ color: 'var(--text3)' }} /> : <Package size={13} style={{ color: 'var(--text3)' }} />}
                <div className="list-row__main">
                  <div className="list-row__title" style={{ color: 'var(--acc)', fontSize: 13 }}>
                    {item.slug}
                    {item.version && <span className="ledger-id" style={{ color: 'var(--text3)' }}>v{item.version}</span>}
                  </div>
                </div>
                <div className="list-row__side"><ExternalLink size={12} style={{ color: 'var(--text3)' }} /></div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div>
          {draftItems.length > 0 && (
            <div className="list mb-3" style={{ border: '1px solid var(--border)' }}>
              {draftItems.map((item, i) => (
                <div key={i} className="list-row" style={{ padding: '6px 12px', cursor: 'default' }}>
                  {item.kind === 'service' ? <Server size={13} style={{ color: 'var(--text3)' }} /> : <Package size={13} style={{ color: 'var(--text3)' }} />}
                  <div className="list-row__main">
                    <div className="list-row__title" style={{ color: 'var(--text)', fontSize: 13 }}>
                      {item.slug}
                      {item.version && <span className="ledger-id" style={{ color: 'var(--text3)' }}>v{item.version}</span>}
                    </div>
                  </div>
                  <div className="list-row__side"><button className="btn btn-ghost btn-sm btn-icon" onClick={() => removeItem(i)}><X size={12} /></button></div>
                </div>
              ))}
            </div>
          )}

          <ManifestItemPicker onAdd={(item) => setDraftItems((cur) => (cur.some((c) => c.kind === item.kind && c.slug === item.slug) ? cur : [...cur, item]))} />

          <div className="input-wrap mt-3 mb-3">
            <label className="input-label"><Tag size={11} style={{ marginRight: 4 }} />Tag de cette version *</label>
            <input className="input" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Ex: 1.2.0" autoFocus />
            {/* Seul champ qui bloque "Enregistrer" (voir le disabled du bouton
                ci-dessous) — sans indice visuel ici, un bouton grisé sans
                explication ressemblait à une panne plutôt qu'à un champ
                requis pas encore rempli. draftItems peut rester vide : un
                manifeste sans composant est accepté côté backend. */}
            {!tag.trim() && <p className="text-xs text-faint mt-1">Requis — le bouton Enregistrer reste inactif tant qu'aucun tag n'est saisi.</p>}
          </div>

          <div className="flex gap-2">
            <button
              className="btn btn-primary btn-sm"
              disabled={!tag.trim() || createMutation.isPending}
              title={!tag.trim() ? 'Saisissez un tag ci-dessus pour activer ce bouton' : undefined}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Annuler</button>
          </div>
        </div>
      )}
    </div>
  )
}

// Une ligne d'artefact — extraite pour être rendue à l'identique dans le
// résumé replié (juste la dernière version) et dans la modale (toutes).
function ArtifactRow({ artifact, isLatest, onDelete, deleting }: {
  artifact: XDeployArtifact
  isLatest: boolean
  onDelete: () => void
  deleting: boolean
}) {
  return (
    <div className="list-row" style={{ padding: '8px 0', cursor: 'default' }}>
      <Boxes size={13} style={{ color: 'var(--text3)' }} />
      <div className="list-row__main">
        <div className="list-row__title" style={{ color: 'var(--text)', fontSize: 13 }}>
          v{artifact.version}
          {isLatest && <Pill variant="success">Dernière</Pill>}
          <span className="ledger-id" style={{ color: 'var(--text3)' }}>{(artifact.size_bytes / 1024).toFixed(0)} Ko</span>
        </div>
        <div className="list-row__meta">
          <RelativeTime date={artifact.created_at} />
          <code className="font-mono" style={{ fontSize: 10 }}>{artifact.content_sha256.slice(0, 12)}…</code>
        </div>
      </div>
      <div className="list-row__side">
        <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--danger)' }} disabled={deleting} title="Supprimer cet artefact" onClick={onDelete}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

function ArtifactsSection({ project }: { project: Project }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [showAll, setShowAll] = useState(false)

  // xdeploy (app/xdeploy) référence toujours les projets par slug (prj_<hex>,
  // ce que xcore-agent connaît), jamais par l'id interne xdevkeys — voir
  // models/artifact.py::XDeployArtifact.project_id. project.id est le PK
  // xdevkeys, correct pour ManifestSection (routes xdevkeys) mais faux ici.
  const { data: artifacts, isLoading } = useQuery<XDeployArtifact[]>({
    queryKey: ['project-artifacts', project.slug],
    queryFn: () => xdeployArtifactsApi.list(project.slug),
  })

  const deleteMutation = useMutation({
    mutationFn: (artifactId: string) => xdeployArtifactsApi.delete(artifactId),
    onSuccess: () => {
      toast('Artefact supprimé.', 'info')
      queryClient.invalidateQueries({ queryKey: ['project-artifacts', project.slug] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const list = artifacts ?? []
  // Même tri (created_at desc) que ArtifactService.latest() côté backend —
  // le 1er élément EST la version que GET /v1/projects/{id}/versions/latest
  // résoudrait.
  const latest = list[0]

  const confirmDelete = (a: XDeployArtifact, isLatest: boolean) => {
    const warning = isLatest
      ? `Supprimer v${a.version} ? C'est la dernière version — les nouveaux déploiements (xcore-agent sans version explicite) retomberont sur la précédente, s'il y en a une.`
      : `Supprimer l'artefact v${a.version} ? Un déploiement qui en dépend encore ne pourra plus récupérer sa clé.`
    if (confirm(warning)) deleteMutation.mutate(a.id)
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px' }}>
      <div className="flex items-center justify-between mb-3" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="flex items-center gap-2">
          <HardDrive size={14} style={{ color: 'var(--text3)' }} />
          <span className="text-xs font-bold" style={{ color: 'var(--text2)' }}>Artefacts .xdeploy publiés</span>
          {list.length > 0 && <Pill>{list.length}</Pill>}
        </div>
        {list.length > 1 && (
          <button className="btn btn-ghost btn-sm" onClick={() => setShowAll(true)}>
            <Boxes size={13} /> Voir les {list.length} versions
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-xs text-faint">Chargement…</div>
      ) : list.length === 0 ? (
        <div className="text-xs text-faint">
          Aucun artefact publié pour ce projet — utilisez <code className="ledger-id">xcore-agent build &amp; publish</code> depuis votre poste (le Hub ne voit jamais le contenu, seulement ces métadonnées une fois scellé).
        </div>
      ) : (
        // Résumé replié : juste la dernière version — la liste complète vit
        // dans la modale (bouton ci-dessus), pour ne pas allonger la page
        // d'un projet avec beaucoup d'historique (voir ArtifactRow).
        <div className="list" style={{ border: 'none' }}>
          <ArtifactRow artifact={latest} isLatest onDelete={() => confirmDelete(latest, true)} deleting={deleteMutation.isPending} />
        </div>
      )}

      {showAll && (
        <Modal title={<>Artefacts .xdeploy — {project.name}</>} onClose={() => setShowAll(false)}>
          <div className="list" style={{ border: 'none' }}>
            {list.map((a, i) => (
              <ArtifactRow key={a.id} artifact={a} isLatest={i === 0} onDelete={() => confirmDelete(a, i === 0)} deleting={deleteMutation.isPending} />
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

function ProjectsPanel() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [showCreate, setShowCreate] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectKind, setProjectKind] = useState<'plugin' | 'service' | 'xdeploy'>('plugin')
  const [projectSlug, setProjectSlug] = useState('')
  const [revealed, setRevealed] = useState<{ key: ApiKeyCreated; projectName: string } | null>(null)

  const [keyForProject, setKeyForProject] = useState<Project | null>(null)
  const [keyName, setKeyName] = useState('')

  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({ queryKey: ['devkeys-projects'], queryFn: devkeysApi.projects.list })

  // Sidebar de navigation par type — la liste mélangeait plugins/services/
  // bundles sans distinction visuelle, difficile à parcourir dès que
  // plusieurs projets de chaque type s'accumulent.
  const [kindFilter, setKindFilter] = useState<'all' | 'plugin' | 'service' | 'xdeploy'>('all')
  const filteredProjects = kindFilter === 'all' ? (projects ?? []) : (projects ?? []).filter((p) => p.kind === kindFilter)

  const { data: myPlugins } = useQuery<Plugin[]>({ queryKey: ['my-plugins'], queryFn: () => pluginsApi.mine('mine'), enabled: showCreate })
  const { data: myServices } = useQuery<ServiceSummary[]>({ queryKey: ['my-services'], queryFn: servicesApi.mine, enabled: showCreate })
  const knownSlugs = (projectKind === 'plugin' ? (myPlugins ?? []) : projectKind === 'service' ? (myServices ?? []) : []).map((p) => p.slug)

  const createProjectMutation = useMutation({
    mutationFn: () => devkeysApi.projects.create({ name: projectName.trim(), kind: projectKind, slug: projectSlug.trim() }),
    onSuccess: (p) => {
      toast(`Projet « ${p.name} » créé.`, 'success')
      setShowCreate(false); setProjectName(''); setProjectSlug('')
      setKeyForProject(p); setKeyName(p.name)
      queryClient.invalidateQueries({ queryKey: ['devkeys-projects'] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const deleteProjectMutation = useMutation({
    mutationFn: (id: string) => devkeysApi.projects.delete(id),
    onSuccess: () => {
      toast('Projet supprimé.', 'info')
      queryClient.invalidateQueries({ queryKey: ['devkeys-projects'] })
      queryClient.invalidateQueries({ queryKey: ['devkeys'] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const { data: keys } = useQuery<ApiKey[]>({ queryKey: ['devkeys'], queryFn: devkeysApi.list })

  const createKeyMutation = useMutation({
    mutationFn: () => devkeysApi.create({ name: keyName.trim(), project_id: keyForProject!.id }),
    onSuccess: (created) => {
      const pname = keyForProject?.name ?? ''
      toast(`Clé du projet « ${pname} » créée.`, 'success')
      setRevealed({ key: created, projectName: pname })
      setKeyForProject(null); setKeyName('')
      queryClient.invalidateQueries({ queryKey: ['devkeys'] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const deleteKeyMutation = useMutation({
    mutationFn: (id: string) => devkeysApi.delete(id),
    onSuccess: () => { toast('Clé révoquée.', 'info'); queryClient.invalidateQueries({ queryKey: ['devkeys'] }) },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  // Clé(s) "de compte" — is_personal=true, valides pour n'importe quel
  // plugin/service public plutôt que limitées à un seul projet (voir
  // ApiKeyService.create_personal côté backend). Jusqu'ici visible/créable
  // uniquement via `xcli login` (flux device-code) : signalé comme
  // confus/manquant, les clés de projet ci-dessus et cette clé-ci
  // apparaissent maintenant dans deux sections bien séparées plutôt que
  // mélangées ou invisibles.
  const personalKeys = (keys ?? []).filter((k) => k.is_personal)
  const [showCreatePersonal, setShowCreatePersonal] = useState(false)
  const [personalKeyName, setPersonalKeyName] = useState('')

  const createPersonalKeyMutation = useMutation({
    mutationFn: () => devkeysApi.create({ name: personalKeyName.trim() }),
    onSuccess: (created) => {
      toast('Clé de compte créée.', 'success')
      setRevealed({ key: created, projectName: created.name })
      setShowCreatePersonal(false); setPersonalKeyName('')
      queryClient.invalidateQueries({ queryKey: ['devkeys'] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const [showSigning, setShowSigning] = useState(false)
  const [signingLabel, setSigningLabel] = useState('')
  const [signingSecret, setSigningSecret] = useState('')

  const { data: signingKey, isLoading: signingLoading } = useQuery<SigningKey | null>({
    queryKey: ['signing-key'],
    queryFn: async () => { try { return await devkeysApi.signingKey.get() } catch { return null } },
  })

  const setSigningMutation = useMutation({
    mutationFn: () => devkeysApi.signingKey.set({ label: signingLabel || undefined, secret: signingSecret || undefined }),
    onSuccess: () => {
      toast('Clé de signature enregistrée.', 'success')
      setShowSigning(false); setSigningLabel(''); setSigningSecret('')
      queryClient.invalidateQueries({ queryKey: ['signing-key'] })
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const deleteSigningMutation = useMutation({
    mutationFn: () => devkeysApi.signingKey.delete(),
    onSuccess: () => { toast('Clé de signature supprimée.', 'info'); queryClient.invalidateQueries({ queryKey: ['signing-key'] }) },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
      {/* Partagé entre la création d'une clé de compte et d'une clé de
          projet (voir createPersonalKeyMutation / createKeyMutation) — au
          niveau racine plutôt que dans l'une des deux sections ci-dessous,
          pour rester correct quelle que soit celle qui a déclenché `revealed`. */}
      {revealed && <RevealedKeyBanner created={revealed.key} projectName={revealed.projectName} onDismiss={() => setRevealed(null)} />}

      <div>
        <div className="flex items-center justify-between mb-4" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="flex items-center gap-3">
            <User size={18} style={{ color: 'var(--acc)' }} />
            <div>
              <h3 className="font-bold" style={{ fontSize: 18 }}>Clé de compte</h3>
              <p className="text-xs text-muted mt-1">
                Valide pour n'importe quel plugin/service public — contrairement aux clés de projet ci-dessous, limitées à une seule cible. Même clé que celle obtenue via <code className="ledger-id">xcli login</code>.
              </p>
            </div>
          </div>
          {!showCreatePersonal && personalKeys.length === 0 && (
            <button className="btn btn-primary btn-sm" onClick={() => { setShowCreatePersonal(true); setPersonalKeyName('Clé de compte') }}>
              <Plus size={14} /> Créer une clé de compte
            </button>
          )}
        </div>

        {showCreatePersonal && (
          <Panel className="mb-4">
            <div className="input-wrap mb-3">
              <label className="input-label">Nom de la clé</label>
              <input className="input" value={personalKeyName} onChange={(e) => setPersonalKeyName(e.target.value)} placeholder="Ex: mon-laptop" autoFocus />
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary btn-sm" disabled={!personalKeyName.trim() || createPersonalKeyMutation.isPending} onClick={() => createPersonalKeyMutation.mutate()}>
                {createPersonalKeyMutation.isPending ? 'Création…' : 'Créer la clé'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCreatePersonal(false)}>Annuler</button>
            </div>
          </Panel>
        )}

        {personalKeys.length > 0 && (
          <div className="panel" style={{ overflow: 'hidden' }}>
            {personalKeys.map((k) => (
              <div key={k.id} className="list-row" style={{ cursor: 'default' }}>
                <KeyRound size={13} style={{ color: 'var(--text3)' }} />
                <div className="list-row__main">
                  <div className="list-row__title" style={{ color: 'var(--text)' }}>
                    {k.name}
                    {k.is_active ? <Pill variant="success">Active</Pill> : <Pill>Révoquée</Pill>}
                  </div>
                  <div className="list-row__meta"><span className="ledger-id">{k.prefix}…</span><span>{k.last_used_at ? <>Dernier usage <RelativeTime date={k.last_used_at} /></> : 'Jamais utilisée'}</span></div>
                </div>
                <div className="list-row__side">
                  <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--danger)' }} title="Révoquer la clé" disabled={deleteKeyMutation.isPending}
                    onClick={() => { if (confirm(`Révoquer la clé de compte "${k.name}" ? Tous les agents qui l'utilisent perdront l'accès, quel que soit le plugin/service.`)) deleteKeyMutation.mutate(k.id) }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-4" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="flex items-center gap-3">
            <Folder size={18} style={{ color: 'var(--acc)' }} />
            <div>
              <h3 className="font-bold" style={{ fontSize: 18 }}>Projets de déploiement</h3>
              <p className="text-xs text-muted mt-1">Un projet cible un plugin ou un service. Créez une clé par projet pour l'agent XCore qui le déploie.</p>
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreate((v) => !v)}><Plus size={16} /> Nouveau projet</button>
        </div>

        {showCreate && (
          <Panel title="Nouveau projet" className="mb-4">
            <div className="input-wrap mb-3">
              <label className="input-label">Nom du projet</label>
              <input className="input" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Ex: prod-eu-west" autoFocus />
            </div>
            <div className="input-wrap mb-3">
              <label className="input-label">Type</label>
              <select className="select" value={projectKind} onChange={(e) => { setProjectKind(e.target.value as 'plugin' | 'service' | 'xdeploy'); setProjectSlug('') }}>
                <option value="plugin">Plugin (extension XCore)</option>
                <option value="service">Service (déployable)</option>
                <option value="xdeploy">Bundle .xdeploy (plusieurs plugins/services scellés)</option>
              </select>
            </div>
            {projectKind === 'xdeploy' ? (
              <p className="text-xs text-faint mb-4">
                Un identifiant est généré automatiquement pour ce projet — pas de slug à saisir. La composition (quels plugins/services) se déclare ensuite via le manifeste, une fois le projet créé.
              </p>
            ) : (
              <div className="input-wrap mb-4">
                <label className="input-label">Slug de la cible</label>
                <input className="input" list="deploy-project-slugs" value={projectSlug} onChange={(e) => setProjectSlug(e.target.value)} placeholder={projectKind === 'plugin' ? 'Ex: mon-plugin' : 'Ex: mon-service'} />
                <datalist id="deploy-project-slugs">{knownSlugs.map((s) => <option key={s} value={s} />)}</datalist>
              </div>
            )}
            <div className="flex gap-2">
              <button className="btn btn-primary btn-sm" disabled={!projectName.trim() || (projectKind !== 'xdeploy' && !projectSlug.trim()) || createProjectMutation.isPending} onClick={() => createProjectMutation.mutate()}>
                {createProjectMutation.isPending ? 'Création…' : 'Créer le projet'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCreate(false)}>Annuler</button>
            </div>
          </Panel>
        )}

        {projectsLoading ? (
          <div className="flex items-center gap-2 text-muted"><div className="spinner" /> Chargement…</div>
        ) : (projects ?? []).length === 0 ? (
          <div className="empty">
            <div className="empty__icon"><Folder size={36} strokeWidth={1.5} /></div>
            <div className="empty__title">Aucun projet</div>
            <div className="empty__text">Créez un projet de déploiement pour y rattacher une clé API.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 24, alignItems: 'start' }}>
            <nav className="dash-sidebar__nav">
              {(
                [
                  { id: 'all', label: 'Tous', Icon: Folder },
                  { id: 'plugin', label: 'Plugins', Icon: Package },
                  { id: 'service', label: 'Services', Icon: Server },
                  { id: 'xdeploy', label: 'Bundles', Icon: Boxes },
                ] as const
              ).map(({ id, label, Icon }) => {
                const count = id === 'all' ? (projects ?? []).length : (projects ?? []).filter((p) => p.kind === id).length
                return (
                  <button key={id} type="button" className={`dash-sidebar__item${kindFilter === id ? ' active' : ''}`} onClick={() => setKindFilter(id)}>
                    <Icon size={14} /> {label}
                    <span className="text-xs text-faint" style={{ marginLeft: 'auto' }}>{count}</span>
                  </button>
                )
              })}
            </nav>

            {filteredProjects.length === 0 ? (
              <div className="empty" style={{ paddingTop: 24, paddingBottom: 24 }}>
                <div className="empty__text">Aucun projet de ce type pour l'instant.</div>
              </div>
            ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredProjects.map((p) => {
              const pKeys = (keys ?? []).filter((k) => k.project_id === p.id)
              const creating = keyForProject?.id === p.id
              return (
                <div key={p.id} className="panel" style={{ overflow: 'hidden' }}>
                  <div className="list-row" style={{ border: 'none', cursor: 'default' }}>
                    {p.kind === 'service' ? <Server size={16} style={{ color: 'var(--text3)' }} /> : p.kind === 'xdeploy' ? <Boxes size={16} style={{ color: 'var(--text3)' }} /> : <Package size={16} style={{ color: 'var(--text3)' }} />}
                    <div className="list-row__main">
                      <div className="list-row__title" style={{ color: 'var(--text)' }}>{p.name}<Pill>{KIND_LABEL[p.kind] ?? p.kind}</Pill></div>
                      <div className="list-row__meta">
                        <span className="ledger-id">{p.slug}</span>
                        <span>créé <RelativeTime date={p.created_at} /></span>
                        <span>{pKeys.length} clé{pKeys.length > 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <div className="list-row__side">
                      <button className="btn btn-secondary btn-sm" disabled={createKeyMutation.isPending}
                        onClick={() => { if (creating) { setKeyForProject(null); setKeyName('') } else { setKeyForProject(p); setKeyName(p.name) } }}>
                        <KeyRound size={13} /> {creating ? 'Annuler' : 'Créer une clé'}
                      </button>
                      <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--danger)' }} title="Supprimer le projet" disabled={deleteProjectMutation.isPending}
                        onClick={() => { if (confirm(`Supprimer le projet "${p.name}" ? Ses clés seront aussi supprimées.`)) deleteProjectMutation.mutate(p.id) }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {creating && (
                    <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface2)' }}>
                      <div className="input-wrap mb-3">
                        <label className="input-label">Nom de la clé — projet « {p.name} »</label>
                        <input className="input" value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="Ex: agent-prod" autoFocus />
                      </div>
                      <div className="flex gap-2">
                        <button className="btn btn-primary btn-sm" disabled={!keyName.trim() || createKeyMutation.isPending} onClick={() => createKeyMutation.mutate()}>
                          {createKeyMutation.isPending ? 'Création…' : 'Créer la clé'}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setKeyForProject(null)}>Annuler</button>
                      </div>
                    </div>
                  )}

                  {pKeys.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--border)' }}>
                      {pKeys.map((k) => (
                        <div key={k.id} className="list-row" style={{ cursor: 'default' }}>
                          <KeyRound size={13} style={{ color: 'var(--text3)' }} />
                          <div className="list-row__main">
                            <div className="list-row__title" style={{ color: 'var(--text)' }}>
                              {k.name}
                              {k.is_active ? <Pill variant="success">Active</Pill> : <Pill>Révoquée</Pill>}
                            </div>
                            <div className="list-row__meta"><span className="ledger-id">{k.prefix}…</span><span>{k.last_used_at ? <>Dernier usage <RelativeTime date={k.last_used_at} /></> : 'Jamais utilisée'}</span></div>
                          </div>
                          <div className="list-row__side">
                            <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--danger)' }} title="Révoquer la clé" disabled={deleteKeyMutation.isPending}
                              onClick={() => { if (confirm(`Révoquer la clé "${k.name}" ? Les agents qui l'utilisent perdront l'accès.`)) deleteKeyMutation.mutate(k.id) }}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {p.kind === 'xdeploy' && <ManifestSection project={p} />}
                  {p.kind === 'xdeploy' && <ArtifactsSection project={p} />}
                </div>
              )
            })}
            </div>
            )}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-4" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="flex items-center gap-3">
            <FileSignature size={18} style={{ color: 'var(--acc)' }} />
            <div>
              <h3 className="font-bold" style={{ fontSize: 18 }}>Clé de signature</h3>
              <p className="text-xs text-muted mt-1">Utilisée pour signer/vérifier l'intégrité des rapports de déploiement.</p>
            </div>
          </div>
          {!showSigning && <button className="btn btn-secondary btn-sm" onClick={() => setShowSigning(true)}><FileSignature size={14} /> {signingKey ? 'Remplacer' : 'Configurer'}</button>}
        </div>

        {signingLoading ? (
          <div className="flex items-center gap-2 text-muted"><div className="spinner" /> Chargement…</div>
        ) : !showSigning ? (
          signingKey?.configured ? (
            <div className="panel list-row" style={{ cursor: 'default' }}>
              <FileSignature size={16} style={{ color: 'var(--text3)' }} />
              <div className="list-row__main">
                <div className="list-row__title" style={{ color: 'var(--text)' }}>{signingKey.label}</div>
                <div className="list-row__meta"><span>Mise à jour <RelativeTime date={signingKey.updated_at} /></span></div>
              </div>
              <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--danger)' }} title="Supprimer" disabled={deleteSigningMutation.isPending}
                onClick={() => { if (confirm('Supprimer la clé de signature ?')) deleteSigningMutation.mutate() }}>
                <Trash2 size={14} />
              </button>
            </div>
          ) : (
            <div className="empty" style={{ paddingTop: 24, paddingBottom: 24 }}><div className="empty__text">Aucune clé de signature configurée.</div></div>
          )
        ) : (
          <Panel>
            <div className="input-wrap mb-3">
              <label className="input-label">Label</label>
              <input className="input" value={signingLabel} onChange={(e) => setSigningLabel(e.target.value)} placeholder={signingKey?.label ?? 'default'} />
            </div>
            <div className="input-wrap mb-4">
              <label className="input-label">Secret</label>
              <input className="input" type="password" value={signingSecret} onChange={(e) => setSigningSecret(e.target.value)} placeholder="Laisser vide pour régénérer automatiquement" />
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary btn-sm" disabled={setSigningMutation.isPending} onClick={() => setSigningMutation.mutate()}>
                {setSigningMutation.isPending ? <Loader2 size={14} className="spin" /> : 'Enregistrer'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowSigning(false)}>Annuler</button>
            </div>
          </Panel>
        )}
      </div>
    </div>
  )
}

type Tab = 'fleet' | 'projects'

export default function DeploymentsPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [tab, setTab] = useState<Tab>('fleet')
  const [statusFilter, setStatusFilter] = useState('')

  const { data: items, isLoading } = useQuery<Deployment[]>({
    queryKey: ['deployments', statusFilter],
    queryFn: () => deploymentsApi.list({ status: statusFilter || undefined, limit: 100 }),
    enabled: !!user,
  })

  if (!user) {
    return (
      <div className="page">
        <div className="empty" style={{ paddingTop: 120 }}>
          <div className="empty__icon"><Rocket size={40} strokeWidth={1.5} /></div>
          <div className="empty__title">Connexion requise</div>
          <button className="btn btn-primary" onClick={() => navigate('/auth?mode=login')}>Se connecter</button>
        </div>
      </div>
    )
  }

  const groups = new Map<string, { kind: string; slug: string; count: number; latest: Deployment }>()
  for (const d of items ?? []) {
    const key = `${d.kind}:${d.slug}`
    const existing = groups.get(key)
    if (!existing || new Date(d.created_at) > new Date(existing.latest.created_at)) {
      groups.set(key, { kind: d.kind, slug: d.slug, count: (existing?.count ?? 0) + 1, latest: d })
    } else {
      existing.count += 1
    }
  }
  const groupList = Array.from(groups.values())

  // En cours/Réussis/Échoués comptent le statut du DERNIER déploiement de
  // chaque projet (même base que la liste ci-dessous, groupList) — pas
  // chaque événement brut. Avec le compte brut, un projet redéployé 14 fois
  // (8 échecs historiques puis un succès) affichait "0 Réussis / 8 Échoués"
  // alors que la ligne juste en dessous montrait un badge "Réussi" bien
  // vert : les deux ne pouvaient jamais se contredire visuellement puisque
  // aucun des deux ne racontait la même chose. "Déploiements" reste le
  // total brut (volume d'activité), la seule mesure pour laquelle compter
  // chaque tentative a du sens.
  const totals = groupList.reduce(
    (acc, g) => { acc[g.latest.status] = (acc[g.latest.status] ?? 0) + 1; return acc },
    { running: 0, succeeded: 0, failed: 0, pending: 0 } as Record<string, number>,
  )
  totals.total = (items ?? []).length

  const tabs: TabItem<Tab>[] = [
    { id: 'fleet', label: 'Suivi', icon: <Activity size={13} /> },
    { id: 'projects', label: 'Projets & clés', icon: <KeyRound size={13} /> },
  ]

  return (
    <div className="page">
      <div className="dash-header">
        <div className="dash-header__inner">
          <div className="section__label">Déploiements</div>
          <h1 className="dash-header__title">Mes <span className="gradient-text">déploiements</span></h1>
          <p className="dash-header__sub">Suivi des instances déployées et gestion des clés API de vos agents XCore.</p>
        </div>
      </div>

      <div className="detail-tabs-bar">
        <Tabs items={tabs} active={tab} onChange={setTab} />
      </div>

      <div className="section">
        {tab === 'fleet' ? (
          <>
            {groupList.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                {[
                  { label: 'Déploiements', value: totals.total },
                  { label: 'En cours', value: totals.running },
                  { label: 'Réussis', value: totals.succeeded },
                  { label: 'Échoués', value: totals.failed },
                ].map((s, i) => (
                  <Panel key={s.label}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: i === 2 ? 'var(--success)' : i === 3 ? 'var(--danger)' : 'var(--acc)' }}>{s.value}</div>
                      <div className="text-xs text-faint" style={{ marginTop: 4 }}>{s.label}</div>
                    </div>
                  </Panel>
                ))}
              </div>
            )}

            <div className="filter-bar mb-6">
              {STATUS_FILTERS.map((f) => (
                <div key={f.value} className={`filter-pill${statusFilter === f.value ? ' active' : ''}`} onClick={() => setStatusFilter(f.value)}>{f.label}</div>
              ))}
            </div>

            {isLoading ? (
              <PageLoading text="Chargement des déploiements…" />
            ) : groupList.length === 0 ? (
              <div className="empty">
                <div className="empty__icon"><Rocket size={40} strokeWidth={1.5} /></div>
                <div className="empty__title">Aucun déploiement</div>
                <div className="empty__text">Les déploiements rapportés par vos agents XCore apparaîtront ici.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {groupList.map((g) => <FleetRow key={`${g.kind}:${g.slug}`} kind={g.kind} slug={g.slug} count={g.count} latest={g.latest} />)}
              </div>
            )}

            <div className="alert" style={{ marginTop: 32, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <ExternalLink size={14} style={{ flexShrink: 0, color: 'var(--text3)' }} />
              <span className="text-xs text-muted">Le déploiement lui-même est déclenché par l'agent XCore (clé API) — cette page n'affiche que le suivi. Configurez une clé dans l'onglet « Projets & clés ».</span>
            </div>
          </>
        ) : (
          <ProjectsPanel />
        )}
      </div>
    </div>
  )
}
