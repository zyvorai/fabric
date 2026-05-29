package provider

import (
	"context"

	"github.com/hashicorp/terraform-plugin-framework/datasource"
	"github.com/hashicorp/terraform-plugin-framework/provider"
	"github.com/hashicorp/terraform-plugin-framework/provider/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/types"
)

var _ provider.Provider = &vmspawndProvider{}

type vmspawndProvider struct {
	version string
}

type providerModel struct {
	Endpoint types.String `tfsdk:"endpoint"`
	Token    types.String `tfsdk:"token"`
}

func New(version string) func() provider.Provider {
	return func() provider.Provider {
		return &vmspawndProvider{version: version}
	}
}

func (p *vmspawndProvider) Metadata(_ context.Context, _ provider.MetadataRequest, resp *provider.MetadataResponse) {
	resp.TypeName = "vmspawnd"
	resp.Version = p.version
}

func (p *vmspawndProvider) Schema(_ context.Context, _ provider.SchemaRequest, resp *provider.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Zyvor Fabric control plane (vmspawnd REST API).",
		Attributes: map[string]schema.Attribute{
			"endpoint": schema.StringAttribute{
				Required:    true,
				Description: "Zyvor Fabric API base URL, e.g. http://localhost:9095",
			},
			"token": schema.StringAttribute{
				Optional:    true,
				Sensitive:   true,
				Description: "JWT or API token (required when auth is enabled)",
			},
		},
	}
}

func (p *vmspawndProvider) Configure(ctx context.Context, req provider.ConfigureRequest, resp *provider.ConfigureResponse) {
	var config providerModel
	resp.Diagnostics.Append(req.Config.Get(ctx, &config)...)
	if resp.Diagnostics.HasError() {
		return
	}

	if config.Endpoint.IsNull() || config.Endpoint.ValueString() == "" {
		resp.Diagnostics.AddError("Missing endpoint", "Provider endpoint must be set")
		return
	}

	client := NewClient(config.Endpoint.ValueString(), config.Token.ValueString())
	resp.DataSourceData = client
	resp.ResourceData = client
}

func (p *vmspawndProvider) Resources(_ context.Context) []func() resource.Resource {
	return []func() resource.Resource{
		NewVMResource,
	}
}

func (p *vmspawndProvider) DataSources(_ context.Context) []func() datasource.DataSource {
	return []func() datasource.DataSource{
		NewVMDataSource,
	}
}
