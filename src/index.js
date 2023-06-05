const fse = require('fs-extra');
const {Proskomma} = require('proskomma-core');
const {SofriaRenderFromProskomma} = require('proskomma-json-tools')

const pk = new Proskomma();

if (process.argv.length !== 4) {
    console.log(`USAGE: node index.js <srcUsfm> <outPath>`);
    process.exit(1);
}

let srcUsfm;
try {
    srcUsfm = fse.readFileSync(process.argv[2]).toString();
} catch (err) {
    console.log(`Could not load srcUsfm: ${err}`);
    process.exit(1);
}

pk.importDocument({lang: "grc", abbr: "ugnt"}, "usfm", srcUsfm);

const actions = {
    startDocument: [
        {
            description: "Set up workspace",
            test: () => true,
            action: ({workspace, output}) => {
                output.sentences = [];
                workspace.currentSentence = [];
                workspace.currentAtts = null;
                workspace.chapter = null;
                workspace.verses = null;
                workspace.occurrences = {}
            }
        }
    ],
    startChapter: [
        {
            description: "chapter",
            test: () => true,
            action: ({context, workspace}) => {
                const element = context.sequences[0].element;
                workspace.chapter = element.atts.number;
            }
        },
    ],
    startVerses: [
        {
            description: "verses",
            test: () => true,
            action: ({context, workspace}) => {
                const element = context.sequences[0].element;
                workspace.verses = element.atts.number;
            }
        },
    ],
    endChapter: [
        {
            description: "End chapter",
            test: () => true,
            action: ({workspace}) => {
                workspace.chapter = null;
            }
        }
    ],
    endVerses: [
        {
            description: "End verses",
            test: () => true,
            action: ({workspace, output}) => {
                output.sentences
                    .forEach(
                        s => s.filter(w => !w.occurences)
                            .forEach(w => w.occurrences = workspace.occurrences[w.lemma])
                    );
                workspace.verses = null;
                workspace.occurrences = {};
            }
        }
    ],
    startWrapper: [
        {
            description: "Get atts",
            test: ({context}) => context.sequences[0].element.subType === 'usfm:w',
            action: ({context, workspace}) => {
                const element = context.sequences[0].element;
                workspace.currentAtts = element.atts;
            }
        }
    ],
    endWrapper: [
        {
            description: "Get atts",
            test: ({context}) => context.sequences[0].element.subType === 'usfm:w',
            action: ({workspace}) => {
                workspace.currentAtts = null;
            }
        }
    ],
    text: [
        {
            description: "Process text",
            test: () => true,
            action: ({workspace, context}) => {
                const element = context.sequences[0].element;
                if (
                    element.text.includes('.') ||
                    element.text.includes('?') ||
                    element.text.includes('!')
                ) {
                    if (workspace.currentSentence.length > 0) {
                        output.sentences.push(workspace.currentSentence);
                        workspace.currentSentence = [];
                    }
                } else if (
                    !element.text.includes(',') &&
                    !element.text.includes(';') &&
                    element.text.trim().length > 0 &&
                    workspace.currentAtts
                ) {
                    if (!workspace.occurrences[workspace.currentAtts.lemma]) {
                        workspace.occurrences[workspace.currentAtts.lemma] = 0;
                    }
                    workspace.occurrences[workspace.currentAtts.lemma]++;
                    workspace.currentSentence.push(
                        {
                            content: element.text,
                            lemma: workspace.currentAtts.lemma,
                            strong: workspace.currentAtts.strong,
                            morph: workspace.currentAtts["x-morph"],
                            cv: `${workspace.chapter}:${workspace.verses}`,
                            occurrence: workspace.occurrences[workspace.currentAtts.lemma],
                        }
                    );
                }
            }
        }
    ],
    endDocument: [
        {
            description: "Postprocess sentences",
            test: () => true,
            action: () => {}
        }
    ]
};

const output = {};
const cl = new SofriaRenderFromProskomma({proskomma: pk, actions});
const docId = pk.gqlQuerySync("{documents {id}}").data.documents[0].id;
cl.renderDocument({docId, config: {}, output});
fse.writeJsonSync(process.argv[3], output.sentences);
