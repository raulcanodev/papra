// @vitest-environment happy-dom
import type { SimpleSelectOption } from './simple-select';
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { describe, expect, test } from 'vitest';
import { SimpleSelect } from './simple-select';

describe('simple-select', () => {
  describe('simpleSelect', () => {
    test('when the value and the options it is built from change together, onChange is not called back with the value already selected', async () => {
      // Like an editor line: the options include the current value, and every change rebuilds the line (so the options)
      const [line, setLine] = createSignal({ taxRateBps: 2_100 });
      const options = (): SimpleSelectOption[] => [...new Set([0, 1_000, 2_100, line().taxRateBps])].map(rateBps => ({ value: String(rateBps), label: `${rateBps / 100} %` }));
      const onChangeCalls: string[] = [];

      const container = document.createElement('div');
      document.body.append(container);
      const dispose = render(() => (
        <SimpleSelect
          value={String(line().taxRateBps)}
          options={options()}
          onChange={(value) => {
            onChangeCalls.push(value);
            setLine(current => ({ ...current, taxRateBps: Number(value) }));
          }}
        />
      ), container);

      // The saved line arrives after the first render, as when the editor loads an existing invoice
      setLine({ taxRateBps: 1_000 });
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(onChangeCalls).to.eql([]);
      expect(container.textContent).to.include('10 %');

      dispose();
      container.remove();
    });
  });
});
