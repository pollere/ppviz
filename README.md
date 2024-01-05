# ppviz - view live pping output in a browser

## Summary

`ppviz` is a web-based visualizer for `pping`. There are two
versions of `ppviz`, offline and live.  Both use output from
pping run with the -m flag. The live version is in final
testing, so the directory `web` currently contains everything
needed for the offline version.

More information on `ppviz` and how to use it can be found at
pollere.net/ppviz.html.

## Usage

To invoke offline `ppviz`, open the ppvizFF.html file with a
browser, either directly or by using a local web server. The
ppviz page lets you chose a previously saved `pping -m` output
for analysis.

To invoke `ppviz` on a live pping, first get the line2Chunk nodejs
program. Then, from the command line, `pping -m -i [interface] | node line2Chunk.js`
and from a browser window open ppvizCLI.html (or open on command line).

## Examples

The `web` directory contains an example file, ppvizEX.txt.

## See Also

`pping` at https://github.com/pollere/pping.
`line2Chunk` at https://github.com/pollere/line2Chunk.

## Author

Kathleen Nichols <nichols@pollere.net>.

## Copyright

Copyright (c) 2017-8, Kathleen Nichols <nichols@pollere.net>.

Licensed under the GNU GPLv3. See LICENSE for more details.
