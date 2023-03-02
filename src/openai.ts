import axios from 'axios';
import {createParser, type ParsedEvent, type ReconnectInterval} from 'eventsource-parser';

import type * as types from "./types";

export interface ChatCompletionParams {
    model: string;
    temperature: number;
    top_p: number;
    n: number;
    stream: boolean;
    stop: string|string[];
    max_tokens: number;
    presence_penalty: number;
    frequency_penalty: number;
    logit_bias: null|{[token_id:string|number]: number};
    user: string;
}

export class OpenAI {
    key: string;
    
    constructor(key: string) {
        this.key = key;
    }

    async fetch<Response>(method: 'GET'|'POST', url: string, params: {[key: string]: unknown}): Promise<Response> {
        const res = await axios({
            method, url,
            responseType: 'json',
            headers: {
                'Authorization': `Bearer ${this.key}`,
                'Content-Type': 'application/json',
            },
            data: {...params, stream: false},
        });

        return res.data as Response;
    }

    async *stream<Delta>(method: 'GET'|'POST', url: string, params: {[key: string]: unknown}): AsyncGenerator<Delta> {
        const res = await axios({
            method, url,
            responseType: 'stream',
            headers: {
                'Authorization': `Bearer ${this.key}`,
                'Content-Type': 'application/json',
            },
            data: {...params, stream: true},
        });

        let parsedData: Delta[] = [];
        const parser = createParser((event: ParsedEvent|ReconnectInterval) => {
            if(event.type === 'event') {
                let data = null;
                try {
                    data = JSON.parse(event.data) as Delta;
                } catch(e) {
                    return;
                }
                parsedData.push(data);
            }
        });

        for await (const chunk of res.data) {
            parser.feed(chunk.toString('utf-8'));

            const yieldData = parsedData; parsedData = [];
            for(const data of yieldData) {
                yield data;
            }
        }

        for(const data of parsedData) {
            yield data;
        }
    }

    async chatCompletion(messages: types.Messages, params: Readonly<Partial<ChatCompletionParams>> = {}, deltaCallback?: (delta: Partial<types.Message>, index: number) => void):
            Promise<types.ChoiceResponse<{message: types.Message}>> {   
                 
        const req_params: {stream?: boolean} & {[key: string]: unknown} = {...params};

        req_params.model = req_params.model || "gpt-3.5-turbo";
        req_params.messages = messages;
        const is_stream = req_params.stream = deltaCallback != null;

        if(is_stream) {
            type Delta = types.ChoiceResponse<{delta: Partial<types.Message>}>;
            type Choice = types.Choice<{message: types.Message}>;

            const choices: (Choice|undefined)[] = [];
            for await(const delta of this.stream<Delta>('POST', "https://api.openai.com/v1/chat/completions", req_params)) {
                for(const choice of delta.choices) {
                    const {delta, index} = choice;

                    const curr_data = choices[index] ?? (choices[index] = {message: {role: "assistant", content: ""}, index, finish_reason: null});

                    if(choice.finish_reason) curr_data.finish_reason = choice.finish_reason;
                    if(delta.role) curr_data.message.role = delta.role;
                    if(delta.content) curr_data.message.content += delta.content;

                    deltaCallback(delta, index);
                }
            }

            return {choices: choices.filter((choice) => choice != null) as Choice[]};
        } else {
            type Response = types.ChoiceResponse<{message: types.Message}>;

            return await this.fetch<Response>('POST', "https://api.openai.com/v1/chat/completions", req_params);
        }
    }

    toString(): string { return "[OpenAI]"; }
}