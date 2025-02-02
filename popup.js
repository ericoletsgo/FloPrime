document.addEventListener('DOMContentLoaded', function () {
    // Ensure Showdown is loaded
    if (typeof showdown === 'undefined') {
        console.error("Showdown failed to load.");
        return;
    }

    var converter = new showdown.Converter({ extensions: ['youtube'] });
    var input = document.getElementById('markdown-input');
    var convertButton = document.getElementById('convert');

    function openNewTabWithVideo() {
        var markdownText = input.value.trim();
        var htmlContent = converter.makeHtml(markdownText);

        var newTab = window.open();
        newTab.document.write(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Embedded Video</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
                    iframe { max-width: 100%; height: 500px; }
                </style>
            </head>
            <body>
                <h2>Embedded Video</h2>
                ${htmlContent}
            </body>
            </html>
        `);
        newTab.document.close();
    }

    convertButton.addEventListener('click', openNewTabWithVideo);

    input.addEventListener('keypress', function (event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            openNewTabWithVideo();
        }
    });
});
