import {JsonEvent, JsonFam, JsonGedcomData, JsonIndi} from 'topola';
import {buildSearchIndex, SearchIndex, SearchResult} from './menu/search_index';
import {computeEvidence, EvidenceIndex, Fact} from './util/evidence';
import {
  findRelationshipPath,
  getAncestors,
  getDescendants,
  idToFamMap,
  idToIndiMap,
  TopolaData,
} from './util/gedcom_util';
import {
  FIND_RELATIONSHIP_PATH,
  FOCUS_INDI,
  GET_ANCESTORS,
  GET_DESCENDANTS,
  GET_EVIDENCE_SUMMARY,
  GET_PERSON_EVIDENCE,
  GET_SELECTED_PERSON,
  INSPECT_INDI,
  LIST_RESEARCH_QUEUE,
  SEARCH_INDI,
} from './webmcp_definitions';
import {WebMcpTool} from './webmcp_types';

// Maximum generational lookup depth exposed to the assistant to maintain response latency.
const MAX_GENERATIONS = 5;
// Maximum search results returned to the assistant to maintain response latency.
const MAX_SEARCH_RESULTS = 10;

interface IndiReference {
  id: string;
  name: string;
}

interface DatePlace {
  date?: string;
  place?: string;
}

interface BasicIndi {
  id: string;
  name: string;
  birth?: DatePlace;
  death?: DatePlace;
  mother: IndiReference | null;
  father: IndiReference | null;
}

interface SpouseInfo {
  spouse: BasicIndi | null;
  marriage?: DatePlace;
}

interface FullIndi {
  id: string;
  name: string;
  birth?: DatePlace;
  death?: DatePlace;
  mother: BasicIndi | null;
  father: BasicIndi | null;
  children?: BasicIndi[];
  spouses?: SpouseInfo[];
}

function toMcpResponse(data: unknown) {
  return {
    content: [{type: 'text', text: JSON.stringify(data)}],
    structuredContent: data,
  };
}

function textMcpResponse(text: string) {
  return {
    content: [{type: 'text', text}],
  };
}

export class WebMcpBridge {
  private detailIndi: string | null = null;
  private searchIndex: SearchIndex | null = null;
  private chartData: JsonGedcomData | null = null;
  private indiMap: Map<string, JsonIndi> = new Map();
  private famMap: Map<string, JsonFam> = new Map();
  private setSelectionCallback: ((id: string) => void) | null = null;
  private evidence: EvidenceIndex | null = null;
  private toolsRegistered = false;

  /** Returns the full details of the currently selected person. */
  private async handleGetSelectedPerson() {
    const detailIndi = this.detailIndi;
    if (!detailIndi || detailIndi.startsWith('private_')) {
      return textMcpResponse('No person is currently selected.');
    }
    return toMcpResponse(this.toFullIndi(detailIndi));
  }

  private async handleSearchIndi(params: {query: string}) {
    if (!this.searchIndex && this.chartData) {
      this.searchIndex = buildSearchIndex(this.chartData);
    }
    const index = this.searchIndex;
    if (!index) {
      return textMcpResponse('Data not loaded.');
    }
    const results = index.search(params.query);
    const basicIndis = results
      .slice(0, MAX_SEARCH_RESULTS)
      .map((r: SearchResult) => this.toBasicIndi(r.id))
      .filter(Boolean);
    return toMcpResponse(basicIndis);
  }

  private async handleInspectIndi(params: {id: string}) {
    const result = this.toFullIndi(params.id);
    if (!result) {
      return textMcpResponse(`No person found with id ${params.id}.`);
    }
    return toMcpResponse(result);
  }

  private async handleFocusIndi(params: {id: string}) {
    if (params.id.startsWith('private_')) {
      return textMcpResponse(`No person found with id ${params.id}.`);
    }
    const callback = this.setSelectionCallback;
    if (!callback) {
      return textMcpResponse('Error shifting viewport.');
    }
    callback(params.id);
    return toMcpResponse({status: 'success'});
  }

  private async handleFindRelationshipPath(params: {
    source: string;
    target: string;
  }) {
    const pathIds = findRelationshipPath(
      params.source,
      params.target,
      this.indiMap,
      this.famMap,
    );
    const basicIndis = pathIds
      .map((id) => this.toBasicIndi(id))
      .filter(Boolean);
    return toMcpResponse(basicIndis);
  }

  private async handleGetAncestors(params: {id: string; generations: number}) {
    const ceiling = Math.min(params.generations ?? 3, MAX_GENERATIONS);
    const ancestorIds = getAncestors(
      params.id,
      ceiling,
      this.indiMap,
      this.famMap,
    );
    const basicIndis = ancestorIds
      .map((id) => this.toBasicIndi(id))
      .filter(Boolean);
    return toMcpResponse(basicIndis);
  }

  private async handleGetDescendants(params: {
    id: string;
    generations: number;
  }) {
    const ceiling = Math.min(params.generations ?? 3, MAX_GENERATIONS);
    const descendantIds = getDescendants(
      params.id,
      ceiling,
      this.indiMap,
      this.famMap,
    );
    const basicIndis = descendantIds
      .map((id) => this.toBasicIndi(id))
      .filter(Boolean);
    return toMcpResponse(basicIndis);
  }

  /** The evidence behind the whole file, in the words the research uses. */
  private async handleGetEvidenceSummary() {
    const evidence = this.evidence;
    if (!evidence) {
      return textMcpResponse('Data not loaded.');
    }
    const q = evidence.queues;
    return toMcpResponse({
      facts: evidence.summary.facts,
      from_records: evidence.summary.urkunde,
      secondary_witness: evidence.summary.zweitzeuge,
      lead_only: evidence.summary.hinweis,
      no_source: evidence.summary.ohne,
      queues: {
        no_source: q.ohne.length,
        lead_only: q.hinweis.length,
        unexplained: q.unexplained.length,
        citation_outstanding: q.pending.length,
        parents_unknown: q.frontier.length,
        unattached: q.detached.length,
      },
    });
  }

  private factToMcp(fact: Fact) {
    return {
      fact: fact.tag,
      date: fact.date,
      place: fact.place,
      owner: fact.owner,
      tier: fact.bucket,
      quay: fact.bestQuay,
      citations: fact.citations.map((citation) => ({
        source: citation.sourceId,
        page: citation.page,
        quay: citation.quay,
        note: citation.notes.join(' ') || undefined,
      })),
      unexplained: fact.unexplained,
      citation_outstanding: fact.pending,
    };
  }

  private async handleGetPersonEvidence(params: {id: string}) {
    const person = this.evidence?.persons.get(params.id);
    if (!person) {
      return textMcpResponse(`No evidence found for id ${params.id}.`);
    }
    return toMcpResponse({
      id: person.id,
      name: this.getIndiName(person.id),
      state: person.state,
      parents_unknown: person.frontier,
      unattached: person.detached,
      facts: [...person.facts, ...person.marriages].map((fact) =>
        this.factToMcp(fact),
      ),
    });
  }

  private async handleListResearchQueue(params: {
    queue: string;
    limit?: number;
  }) {
    const evidence = this.evidence;
    if (!evidence) {
      return textMcpResponse('Data not loaded.');
    }
    const limit = Math.min(params.limit ?? 50, 200);
    const factQueues: {[key: string]: Fact[]} = {
      no_source: evidence.queues.ohne,
      lead_only: evidence.queues.hinweis,
      unexplained: evidence.queues.unexplained,
      citation_outstanding: evidence.queues.pending,
    };
    const personQueues: {[key: string]: string[]} = {
      parents_unknown: evidence.queues.frontier,
      unattached: evidence.queues.detached,
    };
    const facts = factQueues[params.queue];
    if (facts) {
      return toMcpResponse({
        total: facts.length,
        rows: facts.slice(0, limit).map((fact) => ({
          ...this.factToMcp(fact),
          name: this.getIndiName(fact.owner),
        })),
      });
    }
    const people = personQueues[params.queue];
    if (people) {
      return toMcpResponse({
        total: people.length,
        rows: people
          .slice(0, limit)
          .map((id) => ({id, name: this.getIndiName(id)})),
      });
    }
    return textMcpResponse(
      `Unknown queue "${params.queue}". Use one of: ${[
        ...Object.keys(factQueues),
        ...Object.keys(personQueues),
      ].join(', ')}.`,
    );
  }

  /** Updates the currently selected individual in focus. */
  public setDetailIndi(newDetailIndi: string | null): void {
    this.detailIndi = newDetailIndi;
  }

  /** Updates internal dataset and rebuilds search indexes and ID maps. */
  public setData(newData: TopolaData | null): void {
    if (newData) {
      this.indiMap = idToIndiMap(newData.chartData);
      this.famMap = idToFamMap(newData.chartData);
      this.chartData = newData.chartData;
      this.searchIndex = null;
      this.evidence = computeEvidence(newData.gedcom);
    } else {
      this.indiMap.clear();
      this.famMap.clear();
      this.chartData = null;
      this.searchIndex = null;
      this.evidence = null;
    }
  }

  /** Attaches standard viewport control callback for tool handlers. */
  public setSetSelectionCallback(callback: (id: string) => void): void {
    this.setSelectionCallback = callback;
  }

  private getIndiName(indiId: string): string {
    const indi = this.indiMap.get(indiId);
    if (!indi) {
      return 'Unknown';
    }
    return (
      [indi.firstName, indi.lastName].filter(Boolean).join(' ') || 'Unknown'
    );
  }

  private getIndiReference(indiId: string): IndiReference {
    return {
      id: indiId,
      name: this.getIndiName(indiId),
    };
  }

  private getEvent(event: JsonEvent | undefined): DatePlace | undefined {
    if (!event) {
      return undefined;
    }
    const parts: string[] = [];
    if (event.date) {
      const d = event.date;
      if (d.day || d.month || d.year) {
        parts.push([d.day, d.month, d.year].filter(Boolean).join('-'));
      } else if (d.text) {
        parts.push(d.text);
      }
    }
    return {
      date: parts.join(' ') || undefined,
      place: event.place,
    };
  }

  private toBasicIndi(indiId: string): BasicIndi | null {
    if (indiId.startsWith('private_')) {
      return null;
    }
    const indi = this.indiMap.get(indiId);
    if (!indi) {
      return null;
    }

    let mother = null;
    let father = null;

    if (indi.famc) {
      const fam = this.famMap.get(indi.famc);
      if (fam) {
        if (fam.wife) {
          mother = this.getIndiReference(fam.wife);
        }
        if (fam.husb) {
          father = this.getIndiReference(fam.husb);
        }
      }
    }

    return {
      id: indi.id,
      name: this.getIndiName(indi.id),
      birth: this.getEvent(indi.birth),
      death: this.getEvent(indi.death),
      mother,
      father,
    };
  }

  private toFullIndi(indiId: string): FullIndi | null {
    if (indiId.startsWith('private_')) {
      return null;
    }
    const indi = this.indiMap.get(indiId);
    if (!indi) {
      return null;
    }

    let mother = null;
    let father = null;

    if (indi.famc) {
      const fam = this.famMap.get(indi.famc);
      if (fam) {
        if (fam.wife) {
          mother = this.toBasicIndi(fam.wife);
        }
        if (fam.husb) {
          father = this.toBasicIndi(fam.husb);
        }
      }
    }

    const children: BasicIndi[] = [];
    const spouses: SpouseInfo[] = [];

    if (indi.fams) {
      indi.fams.forEach((famId) => {
        const fam = this.famMap.get(famId);
        if (fam) {
          const spouseId = fam.wife === indiId ? fam.husb : fam.wife;
          if (spouseId) {
            spouses.push({
              spouse: this.toBasicIndi(spouseId),
              marriage: this.getEvent(fam.marriage),
            });
          }
          if (fam.children) {
            fam.children.forEach((childId) => {
              const child = this.toBasicIndi(childId);
              if (child) {
                children.push(child);
              }
            });
          }
        }
      });
    }

    return {
      id: indi.id,
      name: this.getIndiName(indi.id),
      birth: this.getEvent(indi.birth),
      death: this.getEvent(indi.death),
      mother,
      father,
      children,
      spouses,
    };
  }

  /** Returns the list of all WebMCP tools with their respective execution handlers. */
  public getTools(): WebMcpTool[] {
    return [
      {
        ...GET_SELECTED_PERSON,
        execute: () => this.handleGetSelectedPerson(),
      },
      {
        ...SEARCH_INDI,
        execute: (params: Record<string, unknown>) =>
          this.handleSearchIndi(params as {query: string}),
      },
      {
        ...INSPECT_INDI,
        execute: (params: Record<string, unknown>) =>
          this.handleInspectIndi(params as {id: string}),
      },
      {
        ...FOCUS_INDI,
        execute: (params: Record<string, unknown>) =>
          this.handleFocusIndi(params as {id: string}),
      },
      {
        ...FIND_RELATIONSHIP_PATH,
        execute: (params: Record<string, unknown>) =>
          this.handleFindRelationshipPath(
            params as {source: string; target: string},
          ),
      },
      {
        ...GET_ANCESTORS,
        execute: (params: Record<string, unknown>) =>
          this.handleGetAncestors(params as {id: string; generations: number}),
      },
      {
        ...GET_DESCENDANTS,
        execute: (params: Record<string, unknown>) =>
          this.handleGetDescendants(
            params as {id: string; generations: number},
          ),
      },
      {
        ...GET_EVIDENCE_SUMMARY,
        execute: () => this.handleGetEvidenceSummary(),
      },
      {
        ...GET_PERSON_EVIDENCE,
        execute: (params: Record<string, unknown>) =>
          this.handleGetPersonEvidence(params as {id: string}),
      },
      {
        ...LIST_RESEARCH_QUEUE,
        execute: (params: Record<string, unknown>) =>
          this.handleListResearchQueue(
            params as {queue: string; limit?: number},
          ),
      },
    ];
  }

  /** Registers standard tools for the LLM research copilot features. */
  public registerTools(): void {
    if (this.toolsRegistered || !navigator.modelContext) {
      return;
    }

    const modelContext = navigator.modelContext;

    this.getTools().forEach((tool) => {
      modelContext.registerTool(tool);
    });
    this.toolsRegistered = true;
  }

  /** Unregisters tools to prevent collision side-effects and cleanup. */
  public unregisterTools(): void {
    if (!this.toolsRegistered || !navigator.modelContext) {
      return;
    }
    const modelContext = navigator.modelContext;
    const unregister = modelContext.unregisterTool;
    if (typeof unregister === 'function') {
      this.getTools().forEach((tool) => {
        try {
          unregister(tool.name);
        } catch (e) {
          /* ignore */
        }
      });
    }
    this.toolsRegistered = false;
  }
}
