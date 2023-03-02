# GPTPersona

![npm](https://img.shields.io/npm/v/gpt-persona?style=flat-square)
![GitHub](https://img.shields.io/github/license/123jimin/GPTPersona?style=flat-square)

A helper library in TypeScript for easily using OpenAI Chat API.

```text
npm install gpt-persona
```

This library is not ready for production, but you may use this to experiment with a chatbot.

This library includes two things:
* A class `Persona` for managing different personas for OpenAI Chat API.
* A thin wrapper `OpenAI` around OpenAI Chat API.
    * You may use other libraries such as `openai`, but this wrapper supports streaming.

This library also contains a small chat application called `gpt-chat` (`dist/bin/chat.js`). Set the `OPENAI_API_KEY` environment variable with your OpenAI API key. 

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

#### `Persona#max_context_token_count`

Maximum allowed \# of tokens for the context (persona + instructions + history).

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

#### `Persona#clearHistory()`

Clears history, but retain persona and instructions.

#### `Persona#toJSON()`

Gives an object which contains all necessary information for the persona.