# gpt-persona

[![npm](https://img.shields.io/npm/v/gpt-persona?style=flat-square)](https://npmjs.org/package/gpt-persona)
![GitHub](https://img.shields.io/github/license/123jimin/gpt-persona?style=flat-square)

A small library in TypeScript for managing different "persona"s for OpenAI's GPT API.

Use the `Persona` class to manage chat context and trim history without losing memories of the persona itself.

```text
npm install gpt-persona
```

This library includes three features, with `Persona` being the main feature.

* A class `Persona` for managing different personas for OpenAI Chat API.
* A thin wrapper `OpenAI` around OpenAI Chat API.
  * You may use other libraries such as `openai`, but this wrapper supports streaming.
* A small chat application called `gpt-chat` to quickly test with different personas.

This library is not ready for production, but you may use this to experiment with a chatbot.

## Example

```js
import {Persona, OpenAI} from 'gpt-persona';

const persona = new Persona("You end every sentence with '-desu' or '-nya'.");

const api = new OpenAI(process.env.OPENAI_API_KEY);

// Method 1: provide the API object
console.log(await persona.respond(api, "Good morning!"));
// Example response: "Good morning desu!"

// Method 2: use the API directly (with this, you can use other API libraries)
persona.pushMessage("Good afternoon!");
const response = await api.chatCompletion(persona.getAPIMessages());
persona.pushResponse(response);
console.log(response);
// Example response: "Good afternoon nya!"

```

## `gpt-chat`

```text
usage: gpt-chat [-h] [-k KEY] [-p PERSONA_FILE]

A simple client for OpenAI's Chat API.

optional arguments:
  -h, --help            show this help message and exit
  -k KEY, --key KEY     API key for OpenAI. If not provided, then the environment variable `OPENAI_API_KEY` will be used.
  -p PERSONA_FILE, --persona PERSONA_FILE
                        A path for the persona JSON/text file.
```

You can use following commands:

* `/quit`: Quit chatting.
* `/persona`: Override the persona.
* `/instruction`: Override the instruction.
* `/reset`: Resets the history and persona.
* `/clear`: Resets the history. Retains persona and instructions.
* `/save`: Save current persona and history.

Start your message with `//` if you want to put `/` at the beginning.

## API

### `Persona`

A `Persona` represents a chat agent. It holds memories of who it is and past conversations.

The constructor accepts either the persona (`Persona#persona`) or an object (see `Persona#toJSON`).

```ts
import {Persona} from 'gpt-persona';

const persona = new Persona("... enter detailed persona for this chat agent ...");
```

#### `Persona#persona`

Every request to the OpenAI API will be started with this. Default role is `system`.

```ts
// Could be a string, a `Message`, or a list of those.
persona.persona = "You are a cat.";
```

#### `Persona#instructions`

Every request to the OpenAI API will be ended with this. Default role is `system`.

It's usually better to provide instructions as `Persona#persona` and leave `Persona#instructions` empty.

#### `Persona#token_count`

\# of tokens for current context (`== this.persona_token_count + this.history_token_count + this.instruction_token_count`).

#### `Persona#max_context_token_count`

Maximum allowed \# of tokens for the context.

#### `async Persona#respond(api, message, options, deltaCallback)`

Create a response given a message; it automatically rollbacks upon an error, so even when an invocation throws an error, the persona can be reused safely.

* `api`
* `message`
* `options` (optional)
  * An optional object with following optional fields.
  * `options.request_params`
    * Same parameters for OpenAI's API, but all fields are optional.
  * `options.additional_instructions`
    * Additional instructions to be provided.
    * Consider it as one-time `persona.instruction`.
  * `options.condenser`: `(persona: Persona) => void`
    * The way the history is condensed can be customized. (See `Persona#condense()` for a bit more details.)
* `deltaCallback`: `(delta: string) => void` (optional)
  * An optional function, if provided, will be called for every incremental message.

Here's an example with streaming:

```ts
import { stdout } from 'node:process';
import { Persona, OpenAI } from "../index.js";

const api = new OpenAI(process.env.OPENAI_API_KEY);

const persona = new Persona("You are a cat.");
persona.instructions = "You have to talk like a cat while responding.";

const response = await persona.respond(api, "Who are you?", {}, function (delta) { stdout.write(delta); });

// Example response: "Meow, I am just a curious cat. How may I assist you?"
```

#### `Persona#condense()`

Condenses the history. Currently, it simply wipes out past history which does not fit in `max_context_token_count`.

##### Custom condenser

Following alternatives may be used (and provided to `options.condenser` above, for example):

* Wipe out random messages.
* Use ellipses to shorten messages.
* Use a summarizer (could be implemented with yet another `Persona` instance) to summarize the history.

Use `persona.history = ...`, and do not modify `history` in-situ like `persona.history.splice(...)`.

Use the exported `countTokens` method to count tokens of message(s).

Use `persona.token_count - persona.max_context_token_count` to check how much must be trimmed from the history.

#### `Persona#clearHistory()`

Clears history, but retain persona and instructions.

#### `Persona#toJSON()`

Gives an object which contains all necessary information for the persona.
