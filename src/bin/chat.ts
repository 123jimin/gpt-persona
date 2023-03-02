import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const rl = readline.createInterface({ input, output });

import { Persona, OpenAI } from "../index.js";

const api = new OpenAI(process.env.OPENAI_API_KEY ?? "");
const persona = new Persona("You are a chat application named `gpt-chat`, written in TypeScript.");

while(true) {
    const user_in = await rl.question("User> ");
    if(!user_in) break;

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