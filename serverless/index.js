const functions = require('@google-cloud/functions-framework');

functions.http('sidebyside', async (req, res) => {
    let queryTokens = req.queryTokens;

    let wikipediaPages = await getWikipediaPagesForTokens(queryTokens);

    res.send(JSON.stringify(wikipediaPages));
});

const getWikipediaPagesForTokens = async (queryTokens) => {
    /*
    * getWikipediaPagesForTokens queries the Wikipedia API for the pages that are
    *   relevant to the tokens in the queryTokens list.
    * 
    * First, it parses the token list to see if any tokens are grouped in quotes.
    *   These quoted tokens are viewed as entities. Then best guesses are made
    *   for the grouping of the remaining tokens.
    * 
    * Returns an object, where each key corresponds to Wikipedia page name and each
    *   value is an object which describes the page.
    */

    let wikipediaPages = {};

    // first, extract the entities contained in quotes
    let pagesFromQuotedTokens = await getWikipediaPagesFromQuotedTokens(queryTokens);
    wikipediaPages = {...wikipediaPages, ...pagesFromQuotedTokens};

    // second, use a rule-based approach to make a best guess at the entities
    let pagesFromGuessedEntities = await getWikipediaPagesForGuessedEntities(queryTokens);
    wikipediaPages = {...wikipediaPages, ...pagesFromGuessedEntities};

    return wikipediaPages;
};

const getWikipediaPagesFromQuotedTokens = async (queryTokens) => {
    /*
    * getWikipediaPagesFromQuotedTokens queries the Wikipedia API for the pages
    *   that are relevant to the quoted tokens in the queryTokens list.
    * 
    * First, it parses queryTokens to construct the entity names. Then, it
    *   queries the Wikipedia API.
    * 
    * Returns an object, where each key corresponds to Wikipedia page name and each
    *   value is an object which describes the page.
    */

    // first, parse the token sequence to find which tokens are surrounded by quotes
    let inQuotes = false;
    let quoteSequence = [];
    for (let i = 0; i < queryTokens.length; i++) {
        let token = queryTokens[i];
        if (!inQuotes) {
            if (token.charAt(i) === "\"") {
                quoteSequence.push(i);
                inQuotes = true;
            }
        } else {
            if (token.charAt(token.length - 1) == "\"") {
                quoteSequence.push(i);
                inQuotes = false;
            }
        }
    }

    // second, extract those tokens contained in quotes
    let entities = [];
    for (let i = 0; i < quoteSequence.length; i += 2) {
        if (quoteSequence.length < i) {
            break;
        }

        let quoteStart = quoteSequence[i];
        let quoteEnd = quoteSequence[i+1];

        let entity = queryTokens.slice(quoteStart, quoteEnd+1);
        entity = entity.map(d => d.replace("\"", ""));

        entities.push(entity);
    }

    // third, remove the quoted tokens from queryTokens
    let updatedQueryTokens = [];
    let start = 0;
    let end = -1;
    for (let i = 0; i < quoteSequence.length; i++) {
        if (i % 2 == 0) {
            end = quoteSequence[i];
            updatedQueryTokens.push(...queryTokens.slice(start, end));
        } else {
            start = quoteSequence[i] + 1;
        }
    }
    updatedQueryTokens.push(...queryTokens.slice(start));
    queryTokens = updatedQueryTokens;

    // fourth, get the wikipedia pages for the entities
    let wikipediaPages = {};
    for (let i = 0; i < entities.length; i++) {
        let entity = entities[i].join(" ");

        let wikipediaPage = await searchWikipediaAPI(entity);
        if (wikipediaPage) {
            let [pageName, imageURL] = wikipediaPage;
            wikipediaPages[pageName] = {imageURL: imageURL};
        }
    }

    return wikipediaPages;
};

const getWikipediaPagesForGuessedEntities = async (queryTokens) => {
    /*
    * getWikipediaPagesForGuessedEntities queries the Wikipedia API for the pages
    *   that are relevant to the tokens in the queryTokens list.
    * 
    * First, it parses queryTokens to construct the entity names. Then, it
    *   queries the Wikipedia API.
    * 
    * Returns an object, where each key corresponds to Wikipedia page name and each
    *   value is an object which describes the page.
    */

    let wikipediaPages = {};

    // drain queryTokens until it's empty or no more pages were found
    let addedNewPage = true;
    while (addedNewPage) {
        addedNewPage = false;

        // guess order: first 2, first 3, first 1, first 4, first 5, ... tokens are the name of the first entity
        let guessOrder = [];
        switch(queryTokens.length) {
            case 0:
                return wikipediaPages;
            case 1:
                guessOrder = [1];
                break;
            case 2:
                guessOrder = [2, 1];
                break;
            default:
                guessOrder = [2, 3, 1];
                for (let i = 4; i < queryTokens.length; i++) {
                    guessOrder.push(i);
                }
                break;
        }

        // try each guess until a match is found
        for (let i = 0; i < guessOrder.length; i++) {
            let guessLength = guessOrder[i];
            let guess = queryTokens.slice(0, guessLength).join("_");
            
            let wikipediaPage = await searchWikipediaAPI(guess);
            if (wikipediaPage) {
                let [pageName, imageURL] = wikipediaPage;
                wikipediaPages[pageName] = {imageURL: imageURL};
                addedNewPage = true;

                queryTokens = queryTokens.slice(guessLength);
                break;
            }
        }
    }

    return wikipediaPages;
};

const searchWikipediaAPI = async (query) => {
    /*
    * searchWikipediaAPI searches the Wikipedia API for a page that matches the
    *   query.
    * 
    * Essentially, this converts from the dirty user input (e.g. "lamelo ball" or
    *   "drake") to the cleaned Wikipedia page name (e.g. "LaMelo Ball" or 
    *   "Drake (musician)").
    * 
    * Returns the [page name, image url] if matched, otherwise null.
    */

    // form the API request
    let wikipediaSearchURL = "https://en.wikipedia.org/w/api.php?origin=*"; 
    let wikipediaSearchParams = {
        action: "opensearch",
        search: query,
        limit: "3",
        namespace: "0",
        format: "json"
    }
    Object.keys(wikipediaSearchParams).forEach(function(key){wikipediaSearchURL += "&" + key + "=" + wikipediaSearchParams[key];});
    
    // get the response
    let response = await fetch(wikipediaSearchURL);
    response = await response.json();

    // go through the result list until a match is found
    // define a match to be: a page that has an image
    let wikipediaPageNames = response[1];
    for (let i = 0; i < wikipediaPageNames.length; i++) {
        let imageURL = await getWikipediaPageMainImageURL(wikipediaPageNames[i]);
        if (imageURL) {
            return [wikipediaPageNames[i], imageURL];
        }
    }

    return null;
};

const getWikipediaPageMainImageURL = async (query) => {
    /*
    * getWikipediaPageMainImage returns the image URL associated with the query
    *   Wikipedia page, if one exists. Otherwise, returns null.
    * 
    * Note: the query must exactly match a canonical Wikipedia page name to get
    *   proper results (e.g. "lamelo ball" doesn't work, but "Lamelo Ball" does).
    */

    // form the API request
    let wikipediaImageURL = "https://en.wikipedia.org/w/api.php?origin=*";
    let wikipediaImageParams = {
        action: "query",
        titles: query,
        prop: "pageimages",
        format: "json",
        pithumbsize: "500"
    };
    Object.keys(wikipediaImageParams).forEach(function(key){wikipediaImageURL += "&" + key + "=" + wikipediaImageParams[key];});
    
    // get the response
    let response = await fetch(wikipediaImageURL);
    response = await response.json();

    // get the image url from the response, if it exists
    let pages = response["query"]["pages"];
    let firstPage = Object.keys(pages)[0];
    if ("thumbnail" in pages[firstPage]) {
        return pages[firstPage]["thumbnail"]["source"];
    } else {
        return null;
    }
};
