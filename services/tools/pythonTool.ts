
import { FunctionDeclaration, Type } from "@google/genai";

export const pythonToolDefinition: FunctionDeclaration = {
    name: "execute_python",
    description: "Executes Python code in a secure sandboxed environment. Use this tool for mathematical calculations, data manipulation, logic puzzles, string processing, or when the user explicitly asks to run Python code. The environment supports standard Python libraries. The tool returns the standard output (print statements) and the final expression result.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            code: {
                type: Type.STRING,
                description: "The valid Python code to execute. Do not wrap in markdown code blocks."
            }
        },
        required: ["code"]
    }
};
