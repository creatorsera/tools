// Run with: node --test
const { saveState, loadState, downloadCsv } = require('../utils.js');

describe('Utils', () => {
    test('saveState and loadState', () => {
        const key = 'testState';
        const state = { foo: 'bar' };
        saveState(key, state);
        const loaded = loadState(key);
        expect(loaded).toEqual(state);
    });

    test('downloadCsv', () => {
        // Mock Blob and URL for Node.js
        global.Blob = class Blob {
            constructor(content) { this.content = content; }
        };
        global.URL = { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} };
        const link = { click: jest.fn(), href: '' };
        document.body.appendChild = jest.fn(() => link);
        document.body.removeChild = jest.fn();

        downloadCsv([['a', 'b'], ['1', '2']], 'test.csv');
        expect(document.body.appendChild).toHaveBeenCalled();
        expect(link.click).toHaveBeenCalled();
    });
});
