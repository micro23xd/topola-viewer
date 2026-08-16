import {describe, expect, it} from '@jest/globals';
import {convertGedcom} from './util/gedcom_util';
import {WebMcpBridge} from './webmcp';
import {WebMcpTool} from './webmcp_types';

const FIXTURE = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Dominik /Bauer/
1 SEX M
1 BIRT
2 DATE 1 JAN 1989
2 SOUR @S1@
3 PAGE Standesamt, Nr. 5
3 QUAY 3
1 FAMC @F1@
0 @I2@ INDI
1 NAME Peter /Bauer/
1 SEX M
1 BIRT
2 DATE ABT 1620
2 SOUR @S2@
3 QUAY 1
1 FAMS @F1@
0 @I3@ INDI
1 NAME Margarethe /Unbekannt/
1 SEX F
1 BIRT
2 DATE ABT 1625
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I1@
1 MARR
2 DATE 12 MAY 1645
2 SOUR @S1@
3 QUAY 3
0 @S1@ SOUR
1 TITL Kirchenbuch Bieber
0 @S2@ SOUR
1 TITL Kompilierter Baum
0 TRLR
`;

async function bridgeWithFixture() {
  const data = await convertGedcom(FIXTURE, new Map());
  const bridge = new WebMcpBridge();
  bridge.setData(data);
  const registered: WebMcpTool[] = [];
  (navigator as Navigator & {modelContext?: unknown}).modelContext = {
    registerTool: (tool: WebMcpTool) => registered.push(tool),
    unregisterTool: () => undefined,
  };
  bridge.registerTools();
  return {
    bridge,
    call: (name: string, params: Record<string, unknown> = {}) => {
      const tool = registered.find((candidate) => candidate.name === name);
      if (!tool) throw new Error(`tool not registered: ${name}`);
      return tool.execute(params) as Promise<{structuredContent?: unknown}>;
    },
  };
}

describe('WebMCP evidence tools', () => {
  it('summarises the file the way the research counts it', async () => {
    const {call} = await bridgeWithFixture();
    const result = await call('get_evidence_summary');
    expect(result.structuredContent).toEqual({
      facts: 4,
      from_records: 2,
      secondary_witness: 0,
      lead_only: 1,
      no_source: 1,
      queues: {
        no_source: 1,
        lead_only: 1,
        unexplained: 1,
        citation_outstanding: 0,
        parents_unknown: 2,
        unattached: 0,
      },
    });
  });

  it('returns one person with the citations behind each fact', async () => {
    const {call} = await bridgeWithFixture();
    const result = (await call('get_person_evidence', {id: 'I1'})) as {
      structuredContent: {
        name: string;
        state: string;
        parents_unknown: boolean;
        facts: Array<{fact: string; tier: string; citations: unknown[]}>;
      };
    };
    const person = result.structuredContent;
    expect(person.name).toContain('Dominik');
    expect(person.parents_unknown).toBe(false);
    expect(person.facts.map((fact) => [fact.fact, fact.tier])).toEqual([
      ['BIRT', 'urkunde'],
    ]);
    expect(person.facts[0].citations).toEqual([
      {source: 'S1', page: 'Standesamt, Nr. 5', quay: 3, note: undefined},
    ]);
  });

  it("counts a spouse's marriage among their facts", async () => {
    const {call} = await bridgeWithFixture();
    const result = (await call('get_person_evidence', {id: 'I2'})) as {
      structuredContent: {
        state: string;
        parents_unknown: boolean;
        facts: Array<{fact: string; tier: string}>;
      };
    };
    expect(result.structuredContent.parents_unknown).toBe(true);
    // The birth rests on a compiled tree, so that is the state, not the
    // register-proven marriage.
    expect(result.structuredContent.state).toBe('hinweis');
    expect(result.structuredContent.facts.map((fact) => fact.fact)).toEqual([
      'BIRT',
      'MARR',
    ]);
  });

  it('lists a queue and rejects a name it does not know', async () => {
    const {call} = await bridgeWithFixture();
    const listed = (await call('list_research_queue', {
      queue: 'lead_only',
    })) as {structuredContent: {total: number; rows: Array<{name: string}>}};
    expect(listed.structuredContent.total).toBe(1);
    expect(listed.structuredContent.rows[0].name).toContain('Peter');

    const unknown = (await call('list_research_queue', {
      queue: 'nonsense',
    })) as unknown as {content: Array<{text: string}>};
    expect(unknown.content[0].text).toContain('Unknown queue');
  });
});
