export type Role = 'system'|'user'|'assistant';
export type Message = {role: Role, content: string};
export type Messages = Message[];
export type Choice<T> = T & {
    finish_reason: null|'length'|'finish';
    index: number;
    [key: string]: unknown;
};
export interface ChoiceResponse<T> {
    choices: Choice<T>[];
    [key: string]: unknown;
}