(() => {
    chrome.runtime.onMessage.addListener((obj, sender, response) => {
        const {type, queryTokens} = obj;

        if (type === "NEW") {
            currentQueryTokens = queryTokens;
            newSideBySideSearch(queryTokens);
        }
    });

    const newSideBySideSearch = async (queryTokens) => {
        /*
        * newSideBySideSearch is called once a new Google search page has been loaded
        *   with "side by side" in the search terms.
        * 
        * It calls the cloud severless function and creates the HTML elements to
        *   add to the search page.
        */

        // form request to Google serverless function
        let serverlessURL = "https://us-central1-sidebyside-389300.cloudfunctions.net/sidebyside";
        let requestBody = {
            queryTokens: queryTokens
        };
        requestBody = JSON.stringify(requestBody);


        let entityInfo = [];

        // create HTML elements
        createHTMLElements(entityInfo);
    };

    const createHTMLElements = (entityInfo) => {
        /*
        * createHTMLElements creates and adds the HTML elements to the Google search
        *   for this side by side request.
        */

        // create the HTML elements to add to the search page
        let sideBySideDiv = document.createElement("div");
        sideBySideDiv.setAttribute("id", "sideBySide");
        sideBySideDiv.style.marginBottom = "20px";

        let header = document.createElement("h3");
        header.innerHTML = "Side By Side";
        sideBySideDiv.appendChild(header);

        let imagesDiv = document.createElement("div");
        imagesDiv.style.display = "inline-flex";
        for (let entity in entityInfo) {
            let entityDiv = createEntityDiv(entity);
            imagesDiv.appendChild(entityDiv);
        }
        sideBySideDiv.appendChild(imagesDiv);

        // add the sideBySide div to the top of the search results
        let searchResultsDiv = document.getElementById("search");
        searchResultsDiv.insertBefore(sideBySideDiv, searchResultsDiv.firstChild);
    };

    const createEntityDiv = (entity) => {
        /*
        * createEntityDiv creates the div for one entity from the side by side request
        */

        let img = document.createElement("img");
        img.setAttribute("src", entityInfo[entity].imageURL);
        img.setAttribute("height", "300px");

        let a = document.createElement("a");
        a.setAttribute("href", `https://en.wikipedia.org/wiki/${entity}`);
        a.setAttribute("target", "_blank");
        a.innerHTML = entity;

        let div = document.createElement("div");
        div.appendChild(img);
        div.appendChild(document.createElement("br"));
        div.appendChild(a);
        div.style.marginLeft = "10px";

        return div;
    };
})();