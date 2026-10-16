// Loaded only by the isolated Driver HTTP test child. Never by production.
global.fetch = async () => { throw Error('External requests forbidden in Driver HTTP fixture.'); };
