import {encode as GPTEncode} from 'gpt-3-encoder';

import type * as types from "./types";
import type {OpenAI, ChatCompletionParams} from "./openai";

type MessageLike = string|types.Message;
type MessagesLike = MessageLike|MessageLike[];

function toMessage(default_role: types.Role, message: MessageLike): types.Message {
    return (typeof message === 'string') ? {role: default_role, content: message} : message;
}

function toMessages(default_role: types.Role, messages: MessagesLike): types.Messages {
    return Array.isArray(messages) ? messages.map((x) => toMessage(default_role, x)) : [toMessage(default_role, messages)];
}

function countTokens(messages: MessagesLike): number {
    if(Array.isArray(messages)) {
        return messages.length === 0 ? 0 : messages.map(countTokens).reduce((x, y) => x+y);
    } else {
        return GPTEncode((typeof messages === 'string') ? messages : messages.content).length;
    }
}

export interface PersonaResponseOptions {
    /** The same parameters for {@link https://platform.openai.com/docs/api-reference/chat/create the OpenAI API}. */
    request_params: Partial<ChatCompletionParams>,
    /** One-time additional instructions. */
    additional_instructions: MessagesLike,
}

export type DeltaCallback = (delta: string) => void;

export class Persona {
    private _persona: types.Messages = [];
    get persona(): types.Messages { return this._persona; }
    set persona(persona: MessagesLike) {
        this._persona = toMessages('system', persona);
        this._persona_token_count = countTokens(this._persona);
    }

    private _persona_token_count: number = 0;
    get persona_token_count(): number { return this._persona_token_count; }

    private _history: types.Messages = [];
    get history(): types.Messages { return this._history; }
    set history(history: types.Messages) {
        this._history = history;
        this._history_token_count = countTokens(this._history);
    }

    private _history_token_count: number = 0;
    get history_token_count(): number { return this._history_token_count; }

    private _instructions: types.Messages = [];
    get instructions(): types.Messages { return this._instructions; }
    set instructions(instructions: MessagesLike) {
        this._instructions = toMessages('system', instructions);
        this._instruction_token_count = countTokens(this._instructions);
    }

    private _instruction_token_count: number = 0;
    get instruction_token_count(): number { return this._instruction_token_count;}

    get token_count(): number { return this._persona_token_count + this._history_token_count + this._instruction_token_count; }
    
    /** Maximum \# of tokens allowed in the context (persona + history). */
    max_context_token_count: number = 4096 - 128;

    constructor(persona?: MessagesLike);
    constructor(serialized: {persona: MessagesLike, history?: types.Messages, instructions?: MessagesLike});
    constructor(persona: (MessagesLike|{persona: MessagesLike, history?: types.Messages, instructions?: MessagesLike}) = []) {
        if((typeof persona === 'object') && 'persona' in persona) {
            this.persona = persona.persona;
            
            if(persona.history != null) this.history = persona.history;
            if(persona.instructions != null) this.instructions = persona.instructions;
        } else {
            this.persona = persona;
        }
    }

    clearPersona(): void {
        this._persona = [];
        this._persona_token_count = 0;
    }

    clearHistory(): void {
        this._history = [];
        this._history_token_count = 0;
    }

    clearInstructions(): void {
        this._instructions = [];
        this._instruction_token_count = 0;
    }

    clear(): void {
        this.clearPersona();
        this.clearInstructions();

        this.clearHistory();
    }

    /**
     * Get a list of messages, which can be directly passed to the OpenAI API.
     * @param additional_instructions One-time additional instructions.
     * @returns A list of messages.
     */
    getAPIMessage(additional_instructions: MessagesLike = []): types.Messages {
        const additional_messages = toMessages('system', additional_instructions);

        const max_context_token_count = this.max_context_token_count;
        let token_count: number = this.token_count + countTokens(additional_messages);

        let i = 0;
        while(max_context_token_count > 0 && i < this._history.length && max_context_token_count < token_count) {
            token_count -= countTokens(this._history[i++]);
        }

        return [...this._persona, ...this._history.slice(i), ...this._instructions, ...additional_messages];
    }

    /**
     * Add messages to the history.
     * @param message Messages, assumed to be from the user if provided as string.
     */
    pushMessage(message: MessagesLike) {
        const new_messages = toMessages('user', message);

        this.history.push(...new_messages);
        this._history_token_count += countTokens(new_messages);
    }

    /**
     * Add a new message, assumed to be from itself.
     * @param response Response message.
     * @returns The message that's added to the history.
     */
    pushResponse(response: MessageLike|types.ChoiceResponse<{message: types.Message}>): string {
        const message = ((response): types.Message => {
            if(typeof response === 'object' && 'choices' in response) {
                return response.choices[0].message;
            } else {
                return toMessage('assistant', response);
            }
        })(response);
        
        this.history.push(message);
        this._history_token_count += countTokens(message);

        return message.content;
    }


    async respond(api: OpenAI, message: MessageLike): Promise<string>;
    async respond(api: OpenAI, message: MessageLike, deltaCallback: DeltaCallback): Promise<string>;
    async respond(api: OpenAI, message: MessageLike, options: Partial<PersonaResponseOptions>): Promise<string>;
    async respond(api: OpenAI, message: MessageLike, options: Partial<PersonaResponseOptions>, deltaCallback: DeltaCallback): Promise<string>;

    /**
     * Simple API for chatting.
     * @param api The {@link OpenAI} object.
     * @param message The message from the user.
     * @param in_options Additional options. See {@link PersonaResponseOptions}.
     * @param deltaCallback If provided, then it will be called whenever a delta for the response is available.
     * @returns The response from AI.
     */
    async respond(api: OpenAI, message: MessagesLike, in_options?: Partial<PersonaResponseOptions>|DeltaCallback, deltaCallback?: DeltaCallback): Promise<string> {
        const prev_history_len = this._history.length;
        const prev_history_tokens = this._history_token_count;
        let res_str = "";

        let options: Partial<PersonaResponseOptions> = {};

        if(typeof in_options === 'function') {
            deltaCallback = in_options;
        } else {
            options = options;
        }

        try {
            this.pushMessage(message);
            const res = await api.chatCompletion(this.getAPIMessage(options?.additional_instructions), options?.request_params, deltaCallback ? (msg, ind) => {
                if(deltaCallback && ind === 0 && msg.content) deltaCallback(msg.content);
            } : void 0);
            res_str = this.pushResponse(res);
        } catch(e) {
            // Rollback before throwing
            this._history.splice(prev_history_len);
            this._history_token_count = prev_history_tokens;
            throw e;
        }
        
        this.condense();
        return res_str;
    }

    /**
     * Condenses the history by removing oldest entries.
     */
    condense(): void {
        const max_context_token_count = this.max_context_token_count;
        let token_count: number = this.token_count;

        let i = 0;
        while(max_context_token_count > 0 && i < this._history.length && max_context_token_count < token_count) {
            const removed_token_count = countTokens(this._history[i++]);
            token_count -= removed_token_count;
            this._history_token_count -= removed_token_count;
        }

        this._history.splice(0, i);
    }

    toJSON() {
        return {
            persona: this._persona,
            history: this._history,
            instructions: this._instructions,
        };
    }
}