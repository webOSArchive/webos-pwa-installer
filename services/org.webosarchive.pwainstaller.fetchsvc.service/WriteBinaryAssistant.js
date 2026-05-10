var WriteBinaryAssistant = function() {};

WriteBinaryAssistant.prototype.run = function(future) {
	var args = this.controller.args;

	if (!args.data || !args.path) {
		setError(future, "data and path parameters are required");
		return;
	}

	var dir = args.path.substring(0, args.path.lastIndexOf('/') + 1);
	try { fs.mkdirSync(dir, 0755); } catch(e) {}

	var buf = new Buffer(args.data, 'base64');
	fs.writeFile(args.path, buf, function(err) {
		if (err) {
			setError(future, 'Failed to write icon: ' + err.message);
		} else {
			setResult(future, {path: args.path});
		}
	});
};
