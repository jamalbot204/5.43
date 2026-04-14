import { FunctionDeclaration, Type } from '@google/genai';

export const webSearchToolDefinition: FunctionDeclaration = {
  name: 'search_web',
  description: "Searches the web for a given query. This tool automatically fetches and returns the FULL content of all the search results. You do NOT need to call 'read_webpage' on the results returned by this tool, as their full content is already provided in the response.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'The query to search the web for.',
      },
    },
    required: ['query'],
  },
};

export const webReaderToolDefinition: FunctionDeclaration = {
  name: 'read_webpage',
  description: "Reads the full, uncensored markdown content of a webpage from a given URL. You MUST use this tool immediately if the user provides a link. CRITICAL DIRECTIVE FOR MULTI-PART CONTENT: If the returned markdown indicates the content is split across multiple pages (e.g., links labeled 'Next Page', 'Part 2', 'Continue reading', or numbered pagination), you MUST extract those specific URLs and call this tool AGAIN on them. Continue calling this tool until you have gathered the complete story/article (up to your tool loop limit) BEFORE providing your final response to the user.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      url: {
        type: Type.STRING,
        description: 'The URL of the webpage to read.',
      },
    },
    required: ['url'],
  },
};
