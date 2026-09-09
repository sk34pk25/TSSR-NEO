import { useCallback, useEffect, useRef, useState } from 'react';
import type { Terminal } from '@tssr/sim-systems';
import type { SwitchConsole } from '@tssr/sim-network';
import { useSimValue } from '../state/hooks.ts';

interface Line {
  kind: 'prompt' | 'out' | 'error';
  text: string;
}

export interface ConsoleLike {
  prompt(): string;
  run(command: string): { stdout: string; stderr: string; clear?: boolean };
  help(): string;
}

export function terminalAdapter(terminal: Terminal): ConsoleLike {
  return {
    prompt: () => terminal.prompt(),
    run: (command) => {
      const result = terminal.execute(command);
      // Le caractere de effacement d ecran est traduit en effacement reel du journal.
      if (result.stdout.includes('\f')) return { stdout: '', stderr: '', clear: true };
      return { stdout: result.stdout, stderr: result.stderr };
    },
    help: () => terminal.helpText(),
  };
}

export function switchConsoleAdapter(console_: SwitchConsole): ConsoleLike {
  return {
    prompt: () => console_.prompt(),
    run: (command) => {
      const result = console_.execute(command);
      return result.error
        ? { stdout: '', stderr: result.output }
        : { stdout: result.output, stderr: '' };
    },
    help: () => console_.helpText(),
  };
}

interface TerminalPanelProps {
  console: ConsoleLike;
  title: string;
  intro?: string;
  onCommand?: () => void;
}

/**
 * Terminal interactif.
 * Chaque commande est reellement interpretee par le moteur de simulation :
 * aucune reponse n est pre-enregistree.
 */
export function TerminalPanel({
  console: shell,
  title,
  intro,
  onCommand,
}: TerminalPanelProps): JSX.Element {
  const [lines, setLines] = useState<Line[]>(() =>
    intro === undefined ? [] : [{ kind: 'out', text: intro }],
  );
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const node = outputRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [lines]);

  const submit = useCallback(
    (command: string) => {
      const prompt = shell.prompt();
      const result = shell.run(command);
      if (result.clear === true) {
        setLines([]);
        setHistory((h) => [...h, command]);
        setHistoryIndex(-1);
        onCommand?.();
        return;
      }
      const next: Line[] = [{ kind: 'prompt', text: `${prompt}${command}` }];
      if (result.stdout !== '') next.push({ kind: 'out', text: result.stdout });
      if (result.stderr !== '') next.push({ kind: 'error', text: result.stderr });
      setLines((current) => [...current, ...next].slice(-400));
      setHistory((h) => [...h, command]);
      setHistoryIndex(-1);
      onCommand?.();
    },
    [shell, onCommand],
  );

  // L invite depend de l etat du shell (repertoire, utilisateur, mode) : elle suit les commandes.
  const promptText = useSimValue(lines.length, () => shell.prompt());

  return (
    <div className="neo-panel" style={{ height: '100%' }}>
      <div className="neo-panel__head">
        <span>{title}</span>
        <button
          type="button"
          className="neo-btn neo-btn--ghost neo-btn--sm"
          onClick={() => setLines((current) => [...current, { kind: 'out', text: shell.help() }])}
        >
          Commandes disponibles
        </button>
      </div>
      <div className="terminal">
        <div
          className="terminal__output neo-scroll"
          ref={outputRef}
          role="log"
          aria-live="polite"
          aria-label={`Sortie du terminal ${title}`}
          onClick={() => inputRef.current?.focus()}
        >
          {lines.map((line, index) => (
            <div key={index} className={`terminal__line--${line.kind}`}>
              {line.text}
            </div>
          ))}
        </div>
        <form
          className="terminal__form"
          onSubmit={(event) => {
            event.preventDefault();
            if (value.trim() === '') return;
            submit(value);
            setValue('');
          }}
        >
          <span className="terminal__prompt">{promptText}</span>
          <input
            ref={inputRef}
            className="terminal__input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            aria-label={`Saisie de commande ${title}`}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                // Soumission explicite : ne depend pas de la soumission implicite du formulaire.
                event.preventDefault();
                if (value.trim() === '') return;
                submit(value);
                setValue('');
                return;
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                const index =
                  historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
                const entry = history[index];
                if (entry !== undefined) {
                  setHistoryIndex(index);
                  setValue(entry);
                }
              } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                if (historyIndex === -1) return;
                const index = historyIndex + 1;
                const entry = history[index];
                if (entry === undefined) {
                  setHistoryIndex(-1);
                  setValue('');
                } else {
                  setHistoryIndex(index);
                  setValue(entry);
                }
              }
            }}
          />
          <button
            type="submit"
            className="neo-btn neo-btn--sm"
            aria-label="Executer la commande"
            disabled={value.trim() === ''}
          >
            Executer
          </button>
        </form>
      </div>
    </div>
  );
}
