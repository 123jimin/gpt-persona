#!/usr/bin/env node --no-warnings

/* Parse arguments */
import * as path from 'node:path';
import { ArgumentParser } from 'argparse';

function parsePath(path_str: string): string {
    if(path_str === "") return "";
    if(path.isAbsolute(path_str)) return path_str;
    return path.join(process.cwd(), path_str);
}

const parser = new ArgumentParser({
    prog: 'gpt-chat',
    description: "A simple client for OpenAI's Chat API.",
});

parser.add_argument('-k', '--key', {help: "API key for OpenAI. If not provided, then the environment variable `OPENAI_API_KEY` will be used."})
parser.add_argument('-p', '--persona', {type: parsePath, metavar: 'PERSONA_FILE', help: "A path for the persona JSON/text file."})

const args = parser.parse_args();

/* Prepare readline interface */
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const rl = readline.createInterface({ input, output });

/* Prepare OpenAI API key */
import { Persona, OpenAI } from "../index.js";

let api_key: string = (args['key'] ?? process.env.OPENAI_API_KEY ?? "").trim();

if(!api_key) {
    console.log("An OpenAI API key is required to use this program. Please enter the key below.");
    console.log("(You can also provide an API key by specifying the `OPENAI_API_KEY` env variable.)");
    api_key = (await rl.question("OpenAI API key: ")).trim();
}

/* Prepare persona definition */
import * as fs from 'node:fs/promises';
import * as url from 'node:url';

let persona_def: string = "";

try {
    const persona_path: string|undefined = args.persona;

    if(persona_path) {
        const persona_file_contents = await fs.readFile(persona_path, 'utf-8');

        let persona_file_json = null;
        if(persona_file_contents[0] === '{') {
            try {
                persona_file_json = JSON.parse(persona_file_contents);
            } catch(e) {}
        }

        persona_def = persona_file_json ?? persona_file_contents.replace(/\r/g, '');
    } else {
        const default_persona_path = path.join(path.dirname(url.fileURLToPath(import.meta.url)), "../../persona/gpt-chat.txt");
        persona_def = (await fs.readFile(default_persona_path, 'utf-8')).trim();
    }
} catch(e) {
    if(e instanceof Error) console.error(e.stack);
}

/* Main loop */
const api = new OpenAI(api_key, {retry: {max_retries: 5}});
const persona = new Persona(persona_def);

main_loop: while(true) {
    let user_in = await rl.question("User> ");
    if(!user_in) break main_loop;

    if(user_in.startsWith('//')) {
        user_in = user_in.slice(1);
    }else if(user_in[0] === '/') {
        const args = user_in.slice(1).split(' ');
        switch(args[0].toLowerCase()) {
            case 'exit':
            case 'quit':
                break main_loop;
            case 'persona': {
                const new_persona = args.slice(1).join(' ').trim() || (await rl.question("Input a new persona: ")).trim();
                if(new_persona) {
                    persona.persona = new_persona;
                    console.log("The new persona has been assigned.");
                }
                break;
            }
            case 'inst':
            case 'instruction':
            case 'instructions': {
                const new_inst = args.slice(1).join(' ').trim() || (await rl.question("Input a new instruction: ")).trim()
                if(new_inst) {
                    persona.instructions = new_inst;
                    console.log("The new instruction has been assigned.");
                }
                break;
            }
            case 'reset':
                persona.clear();
                console.log("The persona has been reset.");
                break;
            case 'clear':
            case 'restart':
                persona.clearHistory();
                console.log("The history has been cleared.");
                break;
            case 'save': {
                const save_path = args.slice(1).join(' ').trim() || (await rl.question("Path to save: "));
                if(save_path) {
                    try {
                        await fs.writeFile(save_path, JSON.stringify(persona), 'utf-8');
                    } catch(e) {
                        if(e instanceof Error) console.error(e.stack);
                    }
                }
                break;
            }
            case 'count':
            case 'token':
            case 'tokens': {
                const fixed_count = persona.persona_token_count + persona.instruction_token_count;
                const max_history_count = persona.max_context_token_count - fixed_count;
                const available_count = max_history_count - persona.history_token_count;
                console.log(`Available: ${available_count} (fixed ${fixed_count} + history ${persona.history_token_count} of ${persona.max_context_token_count})`);
                console.log(`Fixed: persona ${persona.persona_token_count} + instruction ${persona.instruction_token_count}`);
                break;
            }
        }
        continue main_loop;
    }

    let first_out = false;
    try {
        await persona.respond(api, user_in, (delta: string) => {
            if(!first_out) {
                first_out = true;
                delta = delta.trimStart();
                output.write("AI> ");
            }
            output.write(delta);
        });
    } catch(e) {
        if(e instanceof Error) {
            console.error(e.stack);
        }
    } finally {
        output.write("\n");
    }
}

rl.close();