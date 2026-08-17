import {ToolDefinition} from './webmcp_types';

export const GET_SELECTED_PERSON: ToolDefinition = {
  name: 'get_selected_person',
  description:
    'Returns the full details (name, events, immediate relatives) of the individual currently selected in the browser viewport.',
  inputSchema: {type: 'object', properties: {}},
};

export const SEARCH_INDI: ToolDefinition = {
  name: 'search_indi',
  description:
    'Searches the genealogy index for individuals by name. Returns up to 10 results starting with the ones that match the best.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {type: 'string', description: 'The name to search for.'},
    },
    required: ['query'],
  },
};

export const INSPECT_INDI: ToolDefinition = {
  name: 'inspect_indi',
  description:
    'Fetches detailed information for a specific individual by ID, including their immediate relatives and life events.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {type: 'string', description: 'The ID of the individual.'},
    },
    required: ['id'],
  },
};

export const FOCUS_INDI: ToolDefinition = {
  name: 'focus_indi',
  description:
    'Instructs the Topola viewer camera view to center on and focus a specific person. Restructures the tree view to show ancestors and descendants of the selected person.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {type: 'string', description: 'The ID to focus.'},
    },
    required: ['id'],
  },
};

export const FIND_RELATIONSHIP_PATH: ToolDefinition = {
  name: 'find_relationship_path',
  description:
    'Finds the shortest path connecting two individuals (e.g., through parents or marriages). Returns an ordered list of connecting individuals.',
  inputSchema: {
    type: 'object',
    properties: {
      source: {type: 'string', description: 'Start individual ID'},
      target: {type: 'string', description: 'End individual ID'},
    },
    required: ['source', 'target'],
  },
};

export const DESCRIBE_RELATIONSHIP: ToolDefinition = {
  name: 'describe_relationship',
  description:
    'Names how two people are related and shows the work: the closest common ancestors (most recent ones only), how many generations up each side, whether the two lines run through the same couple or through two different marriages of one person (a half relationship), how many lines of descent there are altogether, and both chains of descent. Where no common ancestor exists it returns the shortest chain of parent, child and marriage steps joining the two, and where the file records no connection it says so.',
  inputSchema: {
    type: 'object',
    properties: {
      a: {type: 'string', description: 'First individual ID'},
      b: {type: 'string', description: 'Second individual ID'},
      locale: {
        type: 'string',
        description: "Language for the relationship term: 'de' or 'en'.",
      },
    },
    required: ['a', 'b'],
  },
};

export const GET_ANCESTORS: ToolDefinition = {
  name: 'get_ancestors',
  description:
    'Returns ancestors of a specific individual up to a maximum depth of 5 generations.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {type: 'string', description: 'Target individual ID'},
      generations: {
        type: 'number',
        description: 'Depth bound limit (1-5). Defaults to 3.',
        minimum: 1,
        maximum: 5,
        default: 3,
      },
    },
    required: ['id'],
  },
};

export const GET_DESCENDANTS: ToolDefinition = {
  name: 'get_descendants',
  description:
    'Returns descendants of a specific individual up to a maximum depth of 5 generations.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {type: 'string', description: 'Target individual ID'},
      generations: {
        type: 'number',
        description: 'Depth bound limit (1-5). Defaults to 3.',
        minimum: 1,
        maximum: 5,
        default: 3,
      },
    },
    required: ['id'],
  },
};

export const GET_EVIDENCE_SUMMARY: ToolDefinition = {
  name: 'get_evidence_summary',
  description:
    'Returns how well the whole file is evidenced: how many dated or placed facts rest on a record, on a secondary witness, on a compiled tree or on nothing, plus the size of each research queue (facts without a citation, facts resting only on a lead, those without an explaining note, citations still to be filled in, people whose parents are unknown, and people not attached to the tree).',
  inputSchema: {type: 'object', properties: {}},
};

export const GET_PERSON_EVIDENCE: ToolDefinition = {
  name: 'get_person_evidence',
  description:
    "Returns the evidence behind one person: every dated or placed fact with the tier it rests on (QUAY 3 record, 2 secondary witness, 1 compiled tree, 0 family memory), the sources and pages cited for it, and whether the person's parents are unknown or the person is unattached.",
  inputSchema: {
    type: 'object',
    properties: {
      id: {type: 'string', description: 'The ID of the individual.'},
    },
    required: ['id'],
  },
};

export const LIST_RESEARCH_QUEUE: ToolDefinition = {
  name: 'list_research_queue',
  description:
    'Lists one research queue: the facts or people still needing work. Use get_evidence_summary first to see how large each queue is.',
  inputSchema: {
    type: 'object',
    properties: {
      queue: {
        type: 'string',
        description:
          'One of: no_source, lead_only, unexplained, citation_outstanding, parents_unknown, unattached.',
      },
      limit: {
        type: 'number',
        description: 'Maximum rows to return; defaults to 50.',
      },
    },
    required: ['queue'],
  },
};
