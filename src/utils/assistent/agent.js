import Anthropic from '@anthropic-ai/sdk';
import { DEFINICIONS, validaInput } from './eines';
import { INDICACIONS } from './indicacions';
import { opcionsPeticio, einesWeb, costUs, MODEL_PER_DEFECTE, ESFORC_PER_DEFECTE } from './models';

/**
 * Conversa amb Claude amb les eines de l'assistent (veure `docs/assistent.md`).
 *
 * La crida va directament del navegador a l'API d'Anthropic amb la clau de l'usuari: no hi ha
 * cap servidor nostre pel mig. Per això el SDK es crea amb `dangerouslyAllowBrowser`: la clau
 * és de qui fa servir l'aplicació, viu al seu navegador i només surt cap a Anthropic.
 *
 * El bucle és el manual del SDK amb streaming: cada volta envia la conversa, ensenya el text a
 * mesura que arriba, executa les eines que demana el model i hi torna amb els resultats, fins
 * que el model acaba. Les cerques i les lectures web les fa Anthropic als seus servidors
 * (`web_search`, `web_fetch`), i quan en fa moltes la volta pot quedar en `pause_turn`: s'hi
 * torna tal qual perquè continuï.
 *
 * Tres decisions:
 * - **El que torna el model s'afegeix sense tocar-ho** (`content` sencer, amb els blocs de
 *   raonament i, si n'hi ha, el de canvi de model): el model valida aquests blocs i una
 *   conversa editada els invalida.
 * - **Reintent en un altre model si es declina** (`fallbacks: "default"`, a Opus i Sonnet): si
 *   els filtres de seguretat declinen una petició legítima, el servidor la torna a fer amb el
 *   model que Anthropic recomana per a aquell cas en comptes de tornar un refús.
 * - **Validació dels inputs**: amb `eager_input_streaming` l'input de cada eina arriba a
 *   mesura que es genera i el servidor ja no el valida; es comprova aquí contra l'esquema.
 */

export { Anthropic, costUs };

export const creaClient = (apiKey) => new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

const EINES_CLIENT = DEFINICIONS.map(d => ({ ...d, eager_input_streaming: true }));

const MAX_VOLTES = 60;

export class Refus extends Error {}

/**
 * Fa avançar la conversa fins que el model acaba.
 *
 * `historial` és l'array de missatges de l'API i **s'hi afegeix directament**, de manera que
 * si la crida falla o s'atura a mitges qui l'ha cridat té la conversa tal com ha quedat.
 * `executa(nom, input)` executa una eina i torna `{ resultat, resum }` o llança. `model` i
 * `esforc` són els triats al panell (veure `models.js`).
 */
export const avanca = async ({
    client, historial, executa, signal, model = MODEL_PER_DEFECTE, esforc = ESFORC_PER_DEFECTE,
    onText = () => {}, onEina = () => {}, onUs = () => {}, onVolta = () => {},
}) => {
    let reintents = 0;
    for (let volta = 0; volta < MAX_VOLTES; volta++) {
        if (signal?.aborted) return { motiu: 'aturat' };
        onVolta(volta);
        const stream = client.beta.messages.stream({
            ...opcionsPeticio(model, esforc),
            max_tokens: 64000,
            system: [{ type: 'text', text: INDICACIONS, cache_control: { type: 'ephemeral' } }],
            cache_control: { type: 'ephemeral' },
            tools: [...EINES_CLIENT, ...einesWeb(model)],
            messages: historial,
        }, { signal });
        stream.on('text', (delta) => onText(delta));

        let missatge;
        try {
            missatge = await stream.finalMessage();
            reintents = 0;
        } catch (err) {
            // Només es torna a provar quan l'input d'una eina no s'ha pogut llegir; els errors
            // de l'API (i aturar, que n'és un) pugen.
            if (err instanceof Anthropic.APIError || reintents++ >= 2) throw err;
            continue;
        }
        onUs(missatge.usage, missatge.model);

        if (missatge.stop_reason === 'refusal') {
            throw new Refus(missatge.stop_details?.explanation || 'El model ha declinat la petició');
        }
        historial.push({ role: 'assistant', content: missatge.content });
        if (missatge.stop_reason === 'pause_turn') continue;

        const usos = missatge.content.filter(b => b.type === 'tool_use');
        if (usos.length === 0) return { motiu: missatge.stop_reason };
        if (missatge.stop_reason === 'max_tokens') {
            // Un input escapçat pot semblar vàlid: no s'executa. Es contesta perquè la
            // conversa quedi ben formada i es para.
            historial.push({
                role: 'user',
                content: usos.map(u => ({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: 'Resposta tallada per llargada: torna-ho a provar en trossos més petits.' })),
            });
            return { motiu: 'max_tokens' };
        }

        const resultats = [];
        for (const us of usos) {
            const invalid = validaInput(us.name, us.input);
            if (invalid) {
                resultats.push({ type: 'tool_result', tool_use_id: us.id, is_error: true, content: `Input no vàlid: ${invalid}` });
                onEina({ nom: us.name, error: invalid });
                continue;
            }
            onEina({ nom: us.name, input: us.input, enCurs: true });
            try {
                const { resultat, resum } = await executa(us.name, us.input);
                resultats.push({ type: 'tool_result', tool_use_id: us.id, content: JSON.stringify(resultat) });
                onEina({ nom: us.name, resum });
            } catch (err) {
                resultats.push({ type: 'tool_result', tool_use_id: us.id, is_error: true, content: err.message || String(err) });
                onEina({ nom: us.name, error: err.message || String(err) });
            }
        }
        // Tots els resultats en un sol missatge: separats, el model deixa de fer crides en paral·lel.
        historial.push({ role: 'user', content: resultats });
    }
    return { motiu: 'massa_voltes' };
};
